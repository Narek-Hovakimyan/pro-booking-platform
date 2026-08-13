import Redis from "ioredis";

export const DEFAULT_REDIS_NAMESPACE = "hairbook";
export const REDIS_UNAVAILABLE_CODE = "REDIS_UNAVAILABLE";

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 4000;

export class RedisUnavailableError extends Error {
  constructor() {
    super("Redis is unavailable");
    this.name = "RedisUnavailableError";
    this.code = REDIS_UNAVAILABLE_CODE;
  }
}

const createDefaultClient = (url) =>
  new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt) => Math.min(attempt * 50, 1000),
  });

export const createRedisClientService = ({
  createClient = createDefaultClient,
  shutdownTimeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
} = {}) => {
  const state = {
    commandClient: null,
    pubClient: null,
    subClient: null,
    initializePromise: null,
    namespace: DEFAULT_REDIS_NAMESPACE,
    phase: "idle",
    ready: false,
    required: false,
    shutdownPromise: null,
  };

  const closePromises = new WeakMap();

  const clients = () => [state.commandClient, state.pubClient, state.subClient].filter(Boolean);
  const updateReady = () => {
    if (state.phase !== "initializing" && state.phase !== "ready") return;
    state.ready = clients().length === 3 && clients().every((client) => client.status === "ready");
  };
  const markUnavailable = () => {
    if (state.phase === "closed" || state.phase === "shutting_down") return;
    state.ready = false;
  };
  const bindClientLifecycle = (client) => {
    client?.on?.("ready", updateReady);
    client?.on?.("error", updateReady);
    client?.on?.("close", markUnavailable);
    client?.on?.("reconnecting", markUnavailable);
    client?.on?.("end", markUnavailable);
  };

  const closeClientOnce = (client) => {
    if (!client) return Promise.resolve();
    if (closePromises.has(client)) {
      return closePromises.get(client).then(() => {
        if (client.status !== "ready") return;
        closePromises.delete(client);
        return closeClientOnce(client);
      });
    }

    const closePromise = (async () => {
      if (client.status !== "ready" || typeof client.quit !== "function") {
        client.disconnect?.();
        return;
      }

      let timeoutId;
      let timedOut = false;
      try {
        await Promise.race([
          Promise.resolve(client.quit()),
          new Promise((resolve) => {
            timeoutId = setTimeout(() => {
              timedOut = true;
              resolve();
            }, shutdownTimeoutMs);
          }),
        ]);
      } catch {
        timedOut = true;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (timedOut) client.disconnect?.();
      }
    })();

    closePromises.set(client, closePromise);
    return closePromise;
  };

  const closeClientsOrdered = async ({ commandClient, pubClient, subClient }) => {
    state.ready = false;

    await Promise.allSettled([
      closeClientOnce(pubClient),
      closeClientOnce(subClient),
    ]);
    await Promise.allSettled([closeClientOnce(commandClient)]);
  };

  const getCurrentClients = () => ({
    commandClient: state.commandClient,
    pubClient: state.pubClient,
    subClient: state.subClient,
  });

  const closeAllOrdered = async () => {
    const currentClients = getCurrentClients();
    await closeClientsOrdered(currentClients);

    if (state.commandClient === currentClients.commandClient) state.commandClient = null;
    if (state.pubClient === currentClients.pubClient) state.pubClient = null;
    if (state.subClient === currentClients.subClient) state.subClient = null;
  };

  const waitBounded = async (promise) => {
    if (!promise) return;

    let timeoutId;
    try {
      await Promise.race([
        Promise.allSettled([promise]),
        new Promise((resolve) => {
          timeoutId = setTimeout(resolve, shutdownTimeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  const service = {
    async initialize({ url, namespace = DEFAULT_REDIS_NAMESPACE, required = false } = {}) {
      state.required = Boolean(required);
      state.namespace = namespace || DEFAULT_REDIS_NAMESPACE;

      if (!state.required && !url) {
        return { enabled: false, ready: false };
      }

      if (!url || typeof url !== "string") {
        throw new RedisUnavailableError();
      }

      if (state.phase === "ready") {
        return { enabled: true, ready: true };
      }

      if (state.phase === "shutting_down" || state.phase === "closed") {
        throw new RedisUnavailableError();
      }

      if (state.initializePromise) return state.initializePromise;

      state.initializePromise = (async () => {
        state.phase = "initializing";
        let attemptClients = {};
        try {
          state.commandClient = createClient(url);
          state.pubClient = state.commandClient?.duplicate?.() || createClient(url);
          state.subClient = state.commandClient?.duplicate?.() || createClient(url);
          attemptClients = getCurrentClients();

          for (const client of clients()) {
            bindClientLifecycle(client);
          }

          const connectionResults = await Promise.allSettled(
            clients().map(async (client) => {
              if (client?.status !== "ready") {
                await client?.connect?.();
              }
            })
          );

          if (
            connectionResults.some((result) => result.status === "rejected") ||
            state.phase !== "initializing"
          ) {
            throw new RedisUnavailableError();
          }

          state.phase = "ready";
          updateReady();

          if (!state.ready) {
            throw new RedisUnavailableError();
          }

          return { enabled: true, ready: true };
        } catch {
          await closeClientsOrdered(attemptClients);
          if (state.commandClient === attemptClients.commandClient) state.commandClient = null;
          if (state.pubClient === attemptClients.pubClient) state.pubClient = null;
          if (state.subClient === attemptClients.subClient) state.subClient = null;
          if (state.phase !== "shutting_down" && state.phase !== "closed") {
            state.phase = "idle";
          }
          throw new RedisUnavailableError();
        }
      })();

      try {
        return await state.initializePromise;
      } finally {
        state.initializePromise = null;
      }
    },

    getCommandClient() {
      if (!state.ready || !state.commandClient) {
        throw new RedisUnavailableError();
      }

      return state.commandClient;
    },

    getSocketAdapterClients() {
      if (!state.ready || !state.pubClient || !state.subClient) {
        throw new RedisUnavailableError();
      }

      return { pubClient: state.pubClient, subClient: state.subClient };
    },

    getRateLimitKeyPrefix(namespace) {
      return `${state.namespace}:rate-limit:${namespace}:`;
    },

    getSocketAdapterKey() {
      return `${state.namespace}:socket.io`;
    },

    isReady() {
      return state.ready;
    },

    isRequired() {
      return state.required;
    },

    async shutdown() {
      if (state.shutdownPromise) return state.shutdownPromise;

      state.phase = "shutting_down";
      state.ready = false;
      const initializePromise = state.initializePromise;
      state.shutdownPromise = (async () => {
        await closeAllOrdered();
        if (initializePromise) {
          await waitBounded(initializePromise);
          await closeAllOrdered();
        }
        state.phase = "closed";
      })();
      return state.shutdownPromise;
    },

    __resetForTests() {
      state.commandClient = null;
      state.pubClient = null;
      state.subClient = null;
      state.initializePromise = null;
      state.namespace = DEFAULT_REDIS_NAMESPACE;
      state.phase = "idle";
      state.ready = false;
      state.required = false;
      state.shutdownPromise = null;
    },
  };

  return service;
};

export const redisClientService = createRedisClientService();
