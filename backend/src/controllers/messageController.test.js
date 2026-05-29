import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  getConversation,
  getMyMessages,
} from "./messageController.js";
import Message from "../models/Message.js";

const originalMethods = {
  messageFind: Message.find,
};

afterEach(() => {
  Message.find = originalMethods.messageFind;
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

const createFindChain = (messages, captured) => {
  let sortedMessages = messages;

  return {
    populate() {
      return this;
    },
    sort(sortQuery) {
      captured.sort = sortQuery;
      const direction = sortQuery.createdAt;
      sortedMessages = [...messages].sort(
        (left, right) =>
          direction * (new Date(left.createdAt) - new Date(right.createdAt))
      );
      return this;
    },
    limit(limit) {
      captured.limit = limit;
      return sortedMessages.slice(0, limit);
    },
  };
};

test("getMyMessages returns newest limited messages in ascending response order", async () => {
  const captured = {};
  const messages = [
    { _id: "old", createdAt: "2026-05-01T10:00:00.000Z" },
    { _id: "middle", createdAt: "2026-05-02T10:00:00.000Z" },
    { _id: "new", createdAt: "2026-05-03T10:00:00.000Z" },
  ];
  const res = createResponse();

  Message.find = () => createFindChain(messages, captured);

  await getMyMessages(
    {
      user: { id: "user-1" },
      query: { limit: "2" },
    },
    res
  );

  assert.deepEqual(captured.sort, { createdAt: -1 });
  assert.equal(captured.limit, 2);
  assert.deepEqual(
    res.body.map((message) => message._id),
    ["middle", "new"]
  );
});

test("getConversation returns newest limited messages in ascending response order", async () => {
  const captured = {};
  const messages = [
    { _id: "old", createdAt: "2026-05-01T10:00:00.000Z" },
    { _id: "middle", createdAt: "2026-05-02T10:00:00.000Z" },
    { _id: "new", createdAt: "2026-05-03T10:00:00.000Z" },
  ];
  const res = createResponse();

  Message.find = () => createFindChain(messages, captured);

  await getConversation(
    {
      user: { id: "user-1" },
      params: { otherUserId: "user-2" },
      query: { limit: "2" },
    },
    res
  );

  assert.deepEqual(captured.sort, { createdAt: -1 });
  assert.equal(captured.limit, 2);
  assert.deepEqual(
    res.body.map((message) => message._id),
    ["middle", "new"]
  );
});
