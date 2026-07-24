import express from "express";
import mongoose from "mongoose";
import { serverLifecycleService } from "../services/serverLifecycleService.js";

const DEFAULT_PING_TIMEOUT_MS = 1000;

const createOkChecks = () => ({
  shutdown: "ok",
  database_connection: "ok",
  database_ping: "ok",
});

const createUnavailableResponse = (checks) => ({
  statusCode: 503,
  body: {
    status: "unavailable",
    checks,
  },
});

const getDefaultDatabaseCommandRunner = () => mongoose.connection?.db;

export const createReadinessStatusGetter = ({
  isShuttingDown = () => serverLifecycleService.isShuttingDown(),
  isDatabaseConnected = () => mongoose.connection.readyState === 1,
  getDatabaseCommandRunner = getDefaultDatabaseCommandRunner,
  createAbortController = () => new AbortController(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  pingTimeoutMs = DEFAULT_PING_TIMEOUT_MS,
  commandTimeoutMs = DEFAULT_PING_TIMEOUT_MS,
} = {}) => async () => {
  const checks = createOkChecks();

  if (isShuttingDown()) {
    checks.shutdown = "failed";
    return createUnavailableResponse(checks);
  }

  if (!isDatabaseConnected()) {
    checks.database_connection = "failed";
    return createUnavailableResponse(checks);
  }

  const databaseCommandRunner = getDatabaseCommandRunner();

  if (!databaseCommandRunner || typeof databaseCommandRunner.command !== "function") {
    checks.database_connection = "failed";
    return createUnavailableResponse(checks);
  }

  const abortController = createAbortController();
  let timeoutId = null;
  let timedOut = false;
  let pingPromise = null;

  try {
    pingPromise = Promise.resolve(
      databaseCommandRunner.command(
        { ping: 1 },
        {
          signal: abortController.signal,
          maxTimeMS: commandTimeoutMs,
        }
      )
    );
    pingPromise.catch(() => {});

    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeoutFn(() => {
        timedOut = true;
        abortController.abort();
        resolve("timed_out");
      }, pingTimeoutMs);

      timeoutId?.unref?.();
    });

    const pingResult = await Promise.race([
      pingPromise.then(() => "ok").catch(() => "failed"),
      timeoutPromise,
    ]);

    if (pingResult !== "ok") {
      checks.database_ping = "failed";
      return createUnavailableResponse(checks);
    }

    return {
      statusCode: 200,
      body: {
        status: "ok",
        checks,
      },
    };
  } finally {
    if (timeoutId) {
      clearTimeoutFn(timeoutId);
    }

    if (timedOut && pingPromise) {
      pingPromise.catch(() => {});
    }
  }
};

export const createHealthRoutes = ({
  getReadinessStatus = createReadinessStatusGetter(),
} = {}) => {
  const router = express.Router();

  router.get("/", (_req, res) => {
    res.send("API is running");
  });

  router.get("/ready", async (_req, res) => {
    const readiness = await getReadinessStatus();
    res.status(readiness.statusCode).json(readiness.body);
  });

  return router;
};

export default createHealthRoutes();
