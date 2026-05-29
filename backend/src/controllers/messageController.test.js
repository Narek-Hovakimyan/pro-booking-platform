import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  createMessage,
  getConversation,
  getMyMessages,
} from "./messageController.js";
import Message from "../models/Message.js";

const originalMethods = {
  messageCreate: Message.create,
  messageFind: Message.find,
};

afterEach(() => {
  Message.create = originalMethods.messageCreate;
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

test("createMessage rejects text over max length before creating message", async () => {
  let createCalled = false;
  const res = createResponse();

  Message.create = async () => {
    createCalled = true;
  };

  await createMessage(
    {
      user: { id: "sender-1" },
      body: {
        receiverId: "receiver-1",
        text: "x".repeat(5001),
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Message text must be 5000 characters or less");
  assert.equal(createCalled, false);
});
