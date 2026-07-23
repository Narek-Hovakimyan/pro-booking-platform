import {
  applyRefreshedAuthSession,
  expireCurrentAuthSession,
  requestRefreshSession,
} from "@/shared/api/authSession";
import { getAccessToken } from "@/shared/auth/accessTokenStore";

function normalizeCredential(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeCurrentAuth(currentAuth) {
  if (!currentAuth || typeof currentAuth !== "object") {
    return null;
  }

  return {
    userId: normalizeCredential(currentAuth.userId),
    token: normalizeCredential(currentAuth.token),
    generation:
      Number.isInteger(currentAuth.generation) && currentAuth.generation >= 0
        ? currentAuth.generation
        : null,
    active: currentAuth.active !== false,
  };
}

function isSameAuthPair(currentAuth, expectedUserId, expectedAccessToken, expectedGeneration) {
  return Boolean(
    currentAuth?.active &&
      currentAuth.userId === expectedUserId &&
      currentAuth.token === expectedAccessToken &&
      (expectedGeneration == null || currentAuth.generation === expectedGeneration)
  );
}

export function createSocketAuthRecovery(dependencies = {}) {
  const deps = {
    requestRefreshSession: dependencies.requestRefreshSession || requestRefreshSession,
    applyRefreshedAuthSession:
      dependencies.applyRefreshedAuthSession || applyRefreshedAuthSession,
    expireCurrentAuthSession:
      dependencies.expireCurrentAuthSession || expireCurrentAuthSession,
    getAccessToken: dependencies.getAccessToken || getAccessToken,
  };
  const activeRecoveries = new Map();

  return async function recoverSocketAuthSession({
    expectedUserId,
    expectedAccessToken,
    expectedGeneration = null,
    getCurrentAuth,
  } = {}) {
    const normalizedUserId = normalizeCredential(expectedUserId);
    const normalizedExpectedToken = normalizeCredential(expectedAccessToken);

    if (
      !normalizedUserId ||
      !normalizedExpectedToken ||
      typeof getCurrentAuth !== "function"
    ) {
      return null;
    }

    const currentAuth = normalizeCurrentAuth(getCurrentAuth());

    if (
      !isSameAuthPair(
        currentAuth,
        normalizedUserId,
        normalizedExpectedToken,
        expectedGeneration
      )
    ) {
      return null;
    }

    const recoveryKey = `${normalizedUserId}\n${normalizedExpectedToken}`;
    const existingRecovery = activeRecoveries.get(recoveryKey);

    if (existingRecovery) {
      return existingRecovery;
    }

    const recoveryPromise = (async () => {
      try {
        const session = await deps.requestRefreshSession();
        const sessionUserId = normalizeCredential(session?.user?.id);
        const currentAfterRefresh = normalizeCurrentAuth(getCurrentAuth());
        const currentToken = normalizeCredential(deps.getAccessToken());

        if (
          !isSameAuthPair(
            currentAfterRefresh,
            normalizedUserId,
            normalizedExpectedToken,
            expectedGeneration
          ) ||
          currentToken !== normalizedExpectedToken
        ) {
          return null;
        }

        if (sessionUserId !== normalizedUserId) {
          throw new Error("SOCKET_AUTH_RECOVERY_USER_MISMATCH");
        }

        await deps.applyRefreshedAuthSession(session);
        return session;
      } catch {
        const currentAfterFailure = normalizeCurrentAuth(getCurrentAuth());
        const currentToken = normalizeCredential(deps.getAccessToken());

        if (
          !isSameAuthPair(
            currentAfterFailure,
            normalizedUserId,
            normalizedExpectedToken,
            expectedGeneration
          ) ||
          currentToken !== normalizedExpectedToken
        ) {
          return null;
        }

        await deps.expireCurrentAuthSession();
        return null;
      } finally {
        if (activeRecoveries.get(recoveryKey) === recoveryPromise) {
          activeRecoveries.delete(recoveryKey);
        }
      }
    })();

    activeRecoveries.set(recoveryKey, recoveryPromise);
    return recoveryPromise;
  };
}

export const recoverSocketAuthSession = createSocketAuthRecovery();
