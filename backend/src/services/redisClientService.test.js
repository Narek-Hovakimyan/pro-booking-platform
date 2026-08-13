import assert from "node:assert/strict";
import { test } from "node:test";

import {
  REDIS_UNAVAILABLE_CODE,
  createRedisClientService,
} from "./redisClientService.js";

const createDeferred = () => {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const createClientFactory = ({ connectDeferred, failConnectAt, onQuit } = {}) => {
  const clients = [];
  const createClient = () => {
    const index = clients.length + 1;
    const listeners = new Map();
    const client = {
      status: "wait",
      connectCalls: 0,
      disconnectCalls: 0,
      quitCalls: 0,
      on(event, handler) {
        listeners.set(event, handler);
      },
      emit(event) {
        listeners.get(event)?.();
      },
      duplicate() {
        return createClient();
      },
      async connect() {
        this.connectCalls += 1;
        this.status = "connecting";
        if (index === failConnectAt) {
          throw new Error("connection refused");
        }
        if (connectDeferred) await connectDeferred.promise;
        this.status = "ready";
        this.emit("ready");
      },
      async quit() {
        this.quitCalls += 1;
        await onQuit?.(index);
        this.status = "end";
      },
      disconnect() {
        this.disconnectCalls += 1;
        this.status = "end";
      },
    };
    clients.push(client);
    return client;
  };

  return { clients, createClient };
};

test("initializes isolated command, pub, and sub clients once without using a real Redis server", async () => {
  const harness = createClientFactory();
  const service = createRedisClientService({ createClient: harness.createClient });

  const [first, second] = await Promise.all([
    service.initialize({ url: "rediss://user:secret@cache.internal/0", namespace: "hairbook:test", required: true }),
    service.initialize({ url: "rediss://user:secret@cache.internal/0", namespace: "hairbook:test", required: true }),
  ]);

  assert.deepEqual(first, { enabled: true, ready: true });
  assert.deepEqual(second, first);
  assert.equal(harness.clients.length, 3);
  assert.equal(service.isReady(), true);
  assert.equal(service.getRateLimitKeyPrefix("auth"), "hairbook:test:rate-limit:auth:");
  assert.equal(service.getSocketAdapterKey(), "hairbook:test:socket.io");
  assert.equal(service.getSocketAdapterClients().pubClient, harness.clients[1]);
  await service.shutdown();
});

test("a required Redis startup failure is generic and closes partial clients", async () => {
  const harness = createClientFactory({ failConnectAt: 2 });
  const service = createRedisClientService({ createClient: harness.createClient });

  await assert.rejects(
    service.initialize({ url: "rediss://user:secret@cache.internal/0", required: true }),
    (error) => error?.code === REDIS_UNAVAILABLE_CODE && !error.message.includes("secret")
  );

  assert.equal(service.isReady(), false);
  assert.ok(harness.clients.every((client) => client.status === "end"));
  assert.throws(() => service.getCommandClient(), { code: REDIS_UNAVAILABLE_CODE });
});

test("readiness becomes unavailable on connection loss and recovers only after all clients are ready", async () => {
  const harness = createClientFactory();
  const service = createRedisClientService({ createClient: harness.createClient });
  await service.initialize({ url: "redis://cache.internal/0", required: true });

  harness.clients[1].status = "close";
  harness.clients[1].emit("error");
  assert.equal(service.isReady(), false);

  harness.clients[1].status = "ready";
  harness.clients[1].emit("ready");
  assert.equal(service.isReady(), true);
  await service.shutdown();
});

test("shutdown is bounded, idempotent, and never exposes Redis connection details", async () => {
  const harness = createClientFactory();
  const service = createRedisClientService({ createClient: harness.createClient });
  await service.initialize({ url: "rediss://user:secret@cache.internal/0", required: true });

  const [first, second] = await Promise.all([service.shutdown(), service.shutdown()]);

  assert.equal(first, second);
  assert.equal(service.isReady(), false);
  assert.ok(harness.clients.every((client) => client.quitCalls === 1));
  assert.ok(harness.clients.every((client) => client.disconnectCalls === 0));
});

test("shutdown waits for pub/sub closure before starting command-client closure and closes once", async () => {
  const calls = [];
  const pubSubRelease = createDeferred();
  const harness = createClientFactory({
    onQuit: async (index) => {
      calls.push(`start:${index}`);
      if (index !== 1) await pubSubRelease.promise;
      calls.push(`finish:${index}`);
    },
  });
  const service = createRedisClientService({ createClient: harness.createClient });
  await service.initialize({ url: "redis://cache.internal/0", required: true });

  const firstShutdown = service.shutdown();
  const secondShutdown = service.shutdown();
  await Promise.resolve();

  assert.deepEqual(calls.sort(), ["start:2", "start:3"]);
  pubSubRelease.resolve();
  await Promise.all([firstShutdown, secondShutdown]);

  assert.ok(calls.indexOf("start:1") > calls.indexOf("finish:2"));
  assert.ok(calls.indexOf("start:1") > calls.indexOf("finish:3"));
  assert.ok(harness.clients.every((client) => client.quitCalls === 1));
});

test("shutdown during in-flight initialization cannot leak or resurrect connected clients", async () => {
  const connectDeferred = createDeferred();
  const harness = createClientFactory({ connectDeferred });
  const service = createRedisClientService({
    createClient: harness.createClient,
    shutdownTimeoutMs: 10,
  });
  const initialization = service.initialize({
    url: "redis://cache.internal/0",
    required: true,
  });
  await Promise.resolve();

  await service.shutdown();
  assert.equal(service.isReady(), false);
  assert.ok(harness.clients.every((client) => client.status === "end"));

  connectDeferred.resolve();
  await assert.rejects(initialization, { code: REDIS_UNAVAILABLE_CODE });
  assert.equal(service.isReady(), false);
  assert.ok(harness.clients.every((client) => client.status === "end"));
  assert.ok(harness.clients.every((client) => client.disconnectCalls + client.quitCalls >= 1));
});
