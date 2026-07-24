import {
  disconnectDB,
  isDatabaseConnected,
  pingDatabase,
} from "../config/db.js";
import { stopBookingReminderScheduler } from "./booking/bookingReminderScheduler.js";
import { stopSubscriptionExpirationScheduler } from "./subscriptionExpirationScheduler.js";
import { stopWaitlistExpirationScheduler } from "./waitlist/waitlistExpirationScheduler.js";

const DEFAULT_PING_TIMEOUT_MS = 1000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10000;

const okChecks = () => ({
  shutdown: "ok",
  database_connection: "ok",
  database_ping: "ok",
});

const createTimeoutError = () => {
  const error = new Error("shutdown_timeout");
  error.code = "shutdown_timeout";
  return error;
};

const normalizeCronTasks = (cronTasks = []) =>
  cronTasks.filter((task) => task && typeof task.stop === "function");

const stopCronTask = async (task) => {
  task.stop();
};

const stopHttpServer = async (server) => {
  if (!server) return;

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (!error || error.code === "ERR_SERVER_NOT_RUNNING") {
        resolve();
        return;
      }

      reject(error);
    });
  });
};

const closeSocketServer = async (socketServer) => {
  if (!socketServer) return;

  socketServer.disconnectSockets?.(true);

  await new Promise((resolve, reject) => {
    socketServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
};

export const createServerLifecycleService = ({
  logger = console,
  isDatabaseConnectedFn = isDatabaseConnected,
  pingDatabaseFn = pingDatabase,
  disconnectDatabaseFn = disconnectDB,
  stopBookingReminderSchedulerFn = stopBookingReminderScheduler,
  stopWaitlistExpirationSchedulerFn = stopWaitlistExpirationScheduler,
  stopSubscriptionExpirationSchedulerFn = stopSubscriptionExpirationScheduler,
  stopCronTaskFn = stopCronTask,
  closeHttpServerFn = stopHttpServer,
  closeSocketServerFn = closeSocketServer,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  exitFn = (code) => process.exit(code),
  pingTimeoutMs = DEFAULT_PING_TIMEOUT_MS,
  shutdownTimeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
} = {}) => {
  const state = {
    cronTasks: [],
    isShuttingDown: false,
    shutdownPromise: null,
    signalPromise: null,
    server: null,
    socketServer: null,
  };

  const service = {
    configure({
      logger: nextLogger,
      cronTasks,
      server,
      socketServer,
    } = {}) {
      if (nextLogger) {
        logger = nextLogger;
      }

      if (cronTasks) {
        state.cronTasks = normalizeCronTasks(cronTasks);
      }

      if (server !== undefined) {
        state.server = server;
      }

      if (socketServer !== undefined) {
        state.socketServer = socketServer;
      }

      return service;
    },

    setCronTasks(cronTasks = []) {
      state.cronTasks = normalizeCronTasks(cronTasks);
      return state.cronTasks;
    },

    isShuttingDown() {
      return state.isShuttingDown;
    },

    async getReadinessStatus() {
      const checks = okChecks();

      if (state.isShuttingDown) {
        checks.shutdown = "failed";
        return { statusCode: 503, body: { status: "unavailable", checks } };
      }

      if (!isDatabaseConnectedFn()) {
        checks.database_connection = "failed";
        return { statusCode: 503, body: { status: "unavailable", checks } };
      }

      try {
        await pingDatabaseFn({ timeoutMs: pingTimeoutMs });
      } catch {
        checks.database_ping = "failed";
        return { statusCode: 503, body: { status: "unavailable", checks } };
      }

      return { statusCode: 200, body: { status: "ok", checks } };
    },

    async shutdown(signal = "unknown") {
      if (state.shutdownPromise) {
        return state.shutdownPromise;
      }

      state.isShuttingDown = true;

      const cleanup = async () => {
        const failures = [];
        const trackFailure = (error) => {
          failures.push(error);
          logger.error?.(
            { event: "shutdown.cleanup_failed", signal, reason: "cleanup_failed" },
            "Shutdown cleanup step failed"
          );
        };

        for (const stopFn of [
          stopBookingReminderSchedulerFn,
          stopWaitlistExpirationSchedulerFn,
          stopSubscriptionExpirationSchedulerFn,
        ]) {
          try {
            await stopFn();
          } catch (error) {
            trackFailure(error);
          }
        }

        for (const task of state.cronTasks) {
          try {
            await stopCronTaskFn(task);
          } catch (error) {
            trackFailure(error);
          }
        }

        try {
          await closeHttpServerFn(state.server);
        } catch (error) {
          trackFailure(error);
        }

        try {
          await closeSocketServerFn(state.socketServer);
        } catch (error) {
          trackFailure(error);
        }

        try {
          await disconnectDatabaseFn();
        } catch (error) {
          trackFailure(error);
        }

        if (failures.length > 0) {
          throw failures[0];
        }
      };

      state.shutdownPromise = new Promise((resolve) => {
        let timeoutId = null;
        let settled = false;

        const finish = (result) => {
          if (settled) return;
          settled = true;

          if (timeoutId) {
            clearTimeoutFn(timeoutId);
          }

          resolve(result);
        };

        timeoutId = setTimeoutFn(() => {
          logger.error?.(
            { event: "shutdown.timeout", signal, reason: "timeout" },
            "Shutdown timed out"
          );
          finish({ ok: false, exitCode: 1, reason: "timeout" });
        }, shutdownTimeoutMs);

        Promise.resolve()
          .then(cleanup)
          .then(() => {
            logger.info?.(
              { event: "shutdown.complete", signal },
              "Shutdown complete"
            );
            finish({ ok: true, exitCode: 0 });
          })
          .catch((error) => {
            const reason = error?.code === "shutdown_timeout" ? "timeout" : "cleanup_failed";
            logger.error?.(
              { event: "shutdown.failed", signal, reason },
              "Shutdown failed"
            );
            finish({ ok: false, exitCode: 1, reason });
          });
      });

      return state.shutdownPromise;
    },

    async handleSignal(signal) {
      if (state.signalPromise) {
        return state.signalPromise;
      }

      state.signalPromise = service.shutdown(signal).then((result) => {
        exitFn(result.exitCode);
        return result;
      });

      return state.signalPromise;
    },

    installSignalHandlers(processObject = process) {
      const onSigterm = () => {
        void service.handleSignal("SIGTERM");
      };
      const onSigint = () => {
        void service.handleSignal("SIGINT");
      };

      processObject.on("SIGTERM", onSigterm);
      processObject.on("SIGINT", onSigint);

      return () => {
        processObject.off("SIGTERM", onSigterm);
        processObject.off("SIGINT", onSigint);
      };
    },
  };

  return service;
};

export const serverLifecycleService = createServerLifecycleService();
