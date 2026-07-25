import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import Notification from "../../models/Notification.js";
import { getMyNotifications } from "../../controllers/notifications/notificationController.js";
import {
  __notificationServiceTestHooks,
  createNotification,
} from "./notificationService.js";

const originalNotificationCreate = Notification.create;
const originalNotificationFind = Notification.find;
const originalNotificationFindOne = Notification.findOne;

afterEach(() => {
  Notification.create = originalNotificationCreate;
  Notification.find = originalNotificationFind;
  Notification.findOne = originalNotificationFindOne;
  __notificationServiceTestHooks.resetGetIO();
});

const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

test("Notification model accepts notification without data", () => {
  const notification = new Notification({
    userId: new mongoose.Types.ObjectId(),
    type: "booking_created",
    message: "New booking",
  });

  assert.equal(notification.validateSync(), undefined);
  assert.equal(notification.data, undefined);
});

test("Notification model persists only whitelisted data fields", () => {
  const notification = new Notification({
    userId: new mongoose.Types.ObjectId(),
    type: "booking_created",
    message: "New booking",
    data: {
      bookingId: new mongoose.Types.ObjectId(),
      unsafeField: "ignored",
    },
    internalHash: "secret",
  });

  const plainNotification = notification.toObject();

  assert.equal(plainNotification.data.unsafeField, undefined);
  assert.equal(plainNotification.internalHash, undefined);
  assert.ok(plainNotification.data.bookingId);
});

test("Notification schema includes sparse unique internal hash index", () => {
  const indexes = Notification.schema.indexes();
  const internalHashIndex = indexes.find(
    ([key]) => JSON.stringify(key) === JSON.stringify({ internalHash: 1 })
  );

  assert.ok(internalHashIndex);
  assert.equal(internalHashIndex[1].unique, true);
  assert.equal(internalHashIndex[1].sparse, true);
});

test("createNotification works without idempotency key", async () => {
  const userId = new mongoose.Types.ObjectId();
  let createdPayload = null;

  Notification.create = async (payload) => {
    createdPayload = payload;
    return { _id: new mongoose.Types.ObjectId(), ...payload };
  };
  __notificationServiceTestHooks.setGetIO(() => null);

  const notification = await createNotification({
    userId,
    type: "booking_created",
    message: "New booking",
  });

  assert.equal(createdPayload.internalHash, undefined);
  assert.equal(notification.internalHash, undefined);
});

test("createNotification uses deterministic internal hash and hides it from callers", async () => {
  const userId = new mongoose.Types.ObjectId();
  const bookingId = new mongoose.Types.ObjectId();
  let createdPayload = null;

  Notification.create = async (payload) => {
    createdPayload = payload;
    return { _id: new mongoose.Types.ObjectId(), ...payload };
  };
  __notificationServiceTestHooks.setGetIO(() => null);

  const notification = await createNotification({
    userId,
    type: "booking_reminder_24h",
    message: "Reminder",
    data: { bookingId },
    idempotencyKey: "booking:1:user:1",
  });

  assert.equal(typeof createdPayload.internalHash, "string");
  assert.equal(createdPayload.internalHash.length > 0, true);
  assert.equal(notification.internalHash, undefined);
  assert.equal(String(notification.data.bookingId), String(bookingId));
});

test("duplicate idempotent notification returns the existing record", async () => {
  const userId = new mongoose.Types.ObjectId();
  const existing = {
    _id: new mongoose.Types.ObjectId(),
    userId,
    type: "booking_reminder_2h",
    message: "Reminder",
    data: { bookingId: new mongoose.Types.ObjectId() },
    internalHash: "hidden",
    toObject() {
      return { ...this };
    },
  };
  const duplicateError = new Error("duplicate key");
  duplicateError.code = 11000;

  Notification.create = async () => {
    throw duplicateError;
  };
  Notification.findOne = () => ({
    select: async () => existing,
  });
  __notificationServiceTestHooks.setGetIO(() => null);

  const notification = await createNotification({
    userId,
    type: "booking_reminder_2h",
    message: "Reminder",
    data: existing.data,
    idempotencyKey: "dup-key",
  });

  assert.equal(String(notification._id), String(existing._id));
  assert.equal(notification.internalHash, undefined);
});

test("createNotification socket payload omits internal hash", async () => {
  const userId = new mongoose.Types.ObjectId();
  let emitted = null;

  Notification.create = async (payload) => ({
    _id: new mongoose.Types.ObjectId(),
    ...payload,
  });
  __notificationServiceTestHooks.setGetIO(() => ({
    to(room) {
      return {
        emit(eventName, payload) {
          emitted = { room, eventName, payload };
        },
      };
    },
  }));

  await createNotification({
    userId,
    type: "booking_reminder_24h",
    message: "Reminder",
    data: { bookingId: new mongoose.Types.ObjectId() },
    idempotencyKey: "socket-key",
  });

  assert.equal(emitted.room, `user:${userId}`);
  assert.equal(emitted.eventName, "notification");
  assert.equal(emitted.payload.internalHash, undefined);
});

test("createNotification treats socket emit failure as non-fatal after persistence", async () => {
  const userId = new mongoose.Types.ObjectId();

  Notification.create = async (payload) => ({
    _id: new mongoose.Types.ObjectId(),
    ...payload,
  });
  __notificationServiceTestHooks.setGetIO(() => ({
    to() {
      return {
        emit() {
          throw new Error("socket down");
        },
      };
    },
  }));

  const notification = await createNotification({
    userId,
    type: "booking_reminder_2h",
    message: "Reminder",
    idempotencyKey: "socket-failure-key",
  });

  assert.equal(String(notification.userId), String(userId));
});

test("GET /notifications returns data without internal hash", async () => {
  const userId = new mongoose.Types.ObjectId();
  const bookingId = new mongoose.Types.ObjectId();
  const storedNotifications = [
    {
      _id: new mongoose.Types.ObjectId(),
      userId,
      type: "booking_created",
      message: "New booking",
      isRead: false,
      createdAt: new Date(),
      data: { bookingId },
    },
  ];

  Notification.find = (query) => ({
    sort(sortQuery) {
      assert.deepEqual(query, { userId: String(userId) });
      assert.deepEqual(sortQuery, { createdAt: -1 });
      return {
        limit: () => Promise.resolve(storedNotifications),
      };
    },
  });

  const response = createResponse();
  await getMyNotifications({ user: { id: String(userId) } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(String(response.body[0].data.bookingId), String(bookingId));
  assert.equal(response.body[0].internalHash, undefined);
});

test("Notification schema has TTL index on createdAt with 180-day expiry", () => {
  const indexes = Notification.schema.indexes();
  const ttlIndex = indexes.find(
    ([key]) => JSON.stringify(key) === JSON.stringify({ createdAt: 1 })
  );

  assert.ok(ttlIndex);
  assert.equal(ttlIndex[1].expireAfterSeconds, 60 * 60 * 24 * 180);
});
