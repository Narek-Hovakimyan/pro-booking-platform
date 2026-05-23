import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import Notification from "../models/Notification.js";
import { getMyNotifications } from "../controllers/notificationController.js";
import {
  __notificationServiceTestHooks,
  createNotification,
} from "./notificationService.js";

const originalNotificationCreate = Notification.create;
const originalNotificationFind = Notification.find;

afterEach(() => {
  Notification.create = originalNotificationCreate;
  Notification.find = originalNotificationFind;
  __notificationServiceTestHooks.resetGetIO();
});

const createResponse = () => {
  const response = {
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
  };

  return response;
};

test("Notification model accepts notification without data", () => {
  const notification = new Notification({
    userId: new mongoose.Types.ObjectId(),
    type: "booking_created",
    message: "New booking",
  });

  assert.equal(notification.validateSync(), undefined);
  assert.equal(notification.data, undefined);
});

test("Notification model accepts notification with data.bookingId", () => {
  const bookingId = new mongoose.Types.ObjectId();
  const notification = new Notification({
    userId: new mongoose.Types.ObjectId(),
    type: "booking_created",
    message: "New booking",
    data: {
      bookingId,
    },
  });

  assert.equal(notification.validateSync(), undefined);
  assert.equal(String(notification.data.bookingId), String(bookingId));
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
  });

  const plainNotification = notification.toObject();

  assert.equal(plainNotification.data.unsafeField, undefined);
  assert.ok(plainNotification.data.bookingId);
});

test("createNotification works without data", async () => {
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

  assert.equal(createdPayload.userId, userId);
  assert.equal(createdPayload.type, "booking_created");
  assert.equal(createdPayload.message, "New booking");
  assert.equal(Object.hasOwn(createdPayload, "data"), false);
  assert.equal(Object.hasOwn(notification, "data"), false);
});

test("createNotification persists data when provided", async () => {
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
    type: "booking_created",
    message: "New booking",
    data: {
      bookingId,
    },
  });

  assert.equal(String(createdPayload.data.bookingId), String(bookingId));
  assert.equal(String(notification.data.bookingId), String(bookingId));
});

test("createNotification socket payload includes data", async () => {
  const userId = new mongoose.Types.ObjectId();
  const bookingId = new mongoose.Types.ObjectId();
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
    type: "booking_created",
    message: "New booking",
    data: {
      bookingId,
    },
  });

  assert.equal(emitted.room, `user:${userId}`);
  assert.equal(emitted.eventName, "notification");
  assert.equal(String(emitted.payload.data.bookingId), String(bookingId));
});

test("GET /notifications returns data", async () => {
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
      data: {
        bookingId,
      },
    },
  ];

  Notification.find = (query) => ({
    sort(sortQuery) {
      assert.deepEqual(query, { userId: String(userId) });
      assert.deepEqual(sortQuery, { createdAt: -1 });
      return Promise.resolve(storedNotifications);
    },
  });

  const response = createResponse();
  await getMyNotifications({ user: { id: String(userId) } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(String(response.body[0].data.bookingId), String(bookingId));
});
