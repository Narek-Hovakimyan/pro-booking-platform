import { useEffect, useState } from "react";
import { useStore } from "react-redux";

import {
  applyRefreshedAuthSession,
  expireCurrentAuthSession,
  requestRefreshSession,
} from "@/shared/api/authSession";

let bootstrapPromise = null;

function hasLegacySession(store) {
  const authState = store.getState()?.auth;
  return Boolean(authState?.token && authState?.currentUser);
}

function shouldPreserveLegacySession(error) {
  const status = error?.response?.status;

  return (
    status === 401 ||
    status === 403 ||
    status === 429 ||
    (typeof status === "number" && status >= 500) ||
    !status
  );
}

function startBootstrap(store) {
  if (!bootstrapPromise) {
    bootstrapPromise = requestRefreshSession()
      .then((session) => applyRefreshedAuthSession(session))
      .catch(async (error) => {
        const legacySession = hasLegacySession(store);

        if (error?.code === "AUTH_SESSION_INVALID_RESPONSE") {
          await expireCurrentAuthSession();
          return;
        }

        if (!legacySession || !shouldPreserveLegacySession(error)) {
          await expireCurrentAuthSession();
        }
      });
  }

  return bootstrapPromise;
}

export default function AuthSessionBootstrap({ children }) {
  const store = useStore();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    startBootstrap(store).finally(() => {
      if (isMounted) {
        setIsReady(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [store]);

  if (!isReady) {
    return null;
  }

  return children;
}
