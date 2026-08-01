import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  deleteAllNotificationsForUser,
  getMyNotifications,
} from "./notificationController.js";
import Notification from "../../models/Notification.js";

const originalMethods = {
  notificationDeleteMany: Notification.deleteMany,
  notificationFind: Notification.find,
};

afterEach(() => {
  Notification.deleteMany = originalMethods.notificationDeleteMany;
  Notification.find = originalMethods.notificationFind;
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

const withSilencedConsoleError = async (task) => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await task();
  } finally {
    console.error = originalConsoleError;
  }
};

test("getMyNotifications unexpected error returns generic 500", async () => {
  const res = createResponse();

  Notification.find = () => ({
    sort() {
      return this;
    },
    limit() {
      throw new Error("raw notification db failure");
    },
  });

  await withSilencedConsoleError(async () => {
    await getMyNotifications(
      {
        user: { id: "64b000000000000000000001" },
        query: {},
      },
      res
    );
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not fetch notifications");
  assert.equal(res.body.message.includes("raw notification db failure"), false);
});

test("deleteAllNotificationsForUser deletes only the authenticated user's notifications", async () => {
  const res = createResponse();
  let deleteFilter;

  Notification.deleteMany = async (filter) => {
    deleteFilter = filter;
    return { deletedCount: 3 };
  };

  await deleteAllNotificationsForUser(
    {
      user: { id: "64b000000000000000000001" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(deleteFilter, { userId: "64b000000000000000000001" });
  assert.deepEqual(res.body, { deletedCount: 3 });
});
