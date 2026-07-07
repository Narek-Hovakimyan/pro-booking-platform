import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  createMessage,
  getConversation,
  getMyMessages,
} from "./messageController.js";
import Message from "../models/Message.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { __messageAccessTestHooks } from "../services/messageAccessService.js";

const originalMethods = {
  messageCreate: Message.create,
  messageFind: Message.find,
  messageFindById: Message.findById,
  notificationCreate: Notification.create,
  userFindById: User.findById,
};

afterEach(() => {
  Message.create = originalMethods.messageCreate;
  Message.find = originalMethods.messageFind;
  Message.findById = originalMethods.messageFindById;
  Notification.create = originalMethods.notificationCreate;
  User.findById = originalMethods.userFindById;
  __messageAccessTestHooks.reset();
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

const objectId = (suffix) => `64b0000000000000000000${suffix}`;
const clientId = objectId("01");
const otherClientId = objectId("02");
const barberId = objectId("03");
const otherBarberId = objectId("04");

const makeUser = (_id, role) => ({
  _id,
  id: _id,
  role,
});

const stubReceiver = (receiver) => {
  User.findById = () => ({
    select: async () => receiver,
  });
};

const stubDeniedAccess = () => {
  __messageAccessTestHooks.setHasPublicBarberVisibility(async () => false);
  __messageAccessTestHooks.setHasBookingRelationship(async () => false);
  __messageAccessTestHooks.setHasClientStartedConversation(async () => false);
};

const stubMessagePersistence = ({ capturePopulate = [] } = {}) => {
  Message.create = async (payload) => ({ _id: objectId("99"), ...payload });
  Message.findById = () => ({
    populate(path, fields) {
      capturePopulate.push({ path, fields });
      return this;
    },
    then(resolve) {
      return Promise.resolve({
        _id: objectId("99"),
        senderId: {
          _id: clientId,
          name: "Client",
          role: "client",
          avatarUrl: "",
        },
        receiverId: {
          _id: barberId,
          name: "Barber",
          role: "barber",
          avatarUrl: "",
        },
        text: "Hello",
        isRead: false,
      }).then(resolve);
    },
  });
  Notification.create = async (payload) => ({ _id: "notification-a", ...payload });
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

test("createMessage rejects client to client", async () => {
  const res = createResponse();
  let createCalled = false;
  stubReceiver(makeUser(otherClientId, "client"));
  stubDeniedAccess();
  Message.create = async () => {
    createCalled = true;
  };

  await createMessage(
    {
      user: makeUser(clientId, "client"),
      body: { receiverId: otherClientId, text: "Hello" },
    },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Receiver not found");
  assert.equal(createCalled, false);
});

test("createMessage rejects barber to barber", async () => {
  const res = createResponse();
  let createCalled = false;
  stubReceiver(makeUser(otherBarberId, "barber"));
  stubDeniedAccess();
  Message.create = async () => {
    createCalled = true;
  };

  await createMessage(
    {
      user: makeUser(barberId, "barber"),
      body: { receiverId: otherBarberId, text: "Hello" },
    },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Receiver not found");
  assert.equal(createCalled, false);
});

test("createMessage rejects barber to random client", async () => {
  const res = createResponse();
  let createCalled = false;
  stubReceiver(makeUser(clientId, "client"));
  stubDeniedAccess();
  Message.create = async () => {
    createCalled = true;
  };

  await createMessage(
    {
      user: makeUser(barberId, "barber"),
      body: { receiverId: clientId, text: "Hello" },
    },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Receiver not found");
  assert.equal(createCalled, false);
});

test("createMessage allows client to public visible barber", async () => {
  const res = createResponse();
  stubReceiver(makeUser(barberId, "barber"));
  __messageAccessTestHooks.setHasBookingRelationship(async () => false);
  __messageAccessTestHooks.setHasPublicBarberVisibility(async () => true);
  const capturePopulate = [];
  stubMessagePersistence({ capturePopulate });

  await createMessage(
    {
      user: makeUser(clientId, "client"),
      body: { receiverId: barberId, text: " Hello " },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.senderId.phone, undefined);
  assert.equal(res.body.receiverId.phone, undefined);
  assert.equal(res.body.senderId.email, undefined);
  assert.equal(res.body.receiverId.platformRole, undefined);
  assert.deepEqual(
    capturePopulate.map((entry) => entry.fields),
    ["_id name role avatarUrl", "_id name role avatarUrl"]
  );
});

test("createMessage rejects client to non-visible barber without booking", async () => {
  const res = createResponse();
  let createCalled = false;
  let notificationCalled = false;
  let checkedRelationship = null;
  let checkedVisibility = null;
  stubReceiver(makeUser(barberId, "barber"));
  __messageAccessTestHooks.setHasBookingRelationship(async (relationship) => {
    checkedRelationship = relationship;
    return false;
  });
  __messageAccessTestHooks.setHasPublicBarberVisibility(async (checkedBarberId) => {
    checkedVisibility = checkedBarberId;
    return false;
  });
  Message.create = async () => {
    createCalled = true;
  };
  Notification.create = async () => {
    notificationCalled = true;
  };

  await createMessage(
    {
      user: makeUser(clientId, "client"),
      body: { receiverId: barberId, text: "Hello" },
    },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Receiver not found");
  assert.deepEqual(checkedRelationship, { barberId, clientId });
  assert.equal(checkedVisibility, barberId);
  assert.equal(createCalled, false);
  assert.equal(notificationCalled, false);
});

test("createMessage allows client to barber with existing booking", async () => {
  const res = createResponse();
  let checkedRelationship = null;
  stubReceiver(makeUser(barberId, "barber"));
  __messageAccessTestHooks.setHasBookingRelationship(async (relationship) => {
    checkedRelationship = relationship;
    return true;
  });
  __messageAccessTestHooks.setHasPublicBarberVisibility(async () => false);
  stubMessagePersistence();

  await createMessage(
    {
      user: makeUser(clientId, "client"),
      body: { receiverId: barberId, text: "Hello" },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.deepEqual(checkedRelationship, { barberId, clientId });
});

test("createMessage allows barber to client with existing booking", async () => {
  const res = createResponse();
  let checkedRelationship = null;
  stubReceiver(makeUser(clientId, "client"));
  __messageAccessTestHooks.setHasBookingRelationship(async (relationship) => {
    checkedRelationship = relationship;
    return true;
  });
  __messageAccessTestHooks.setHasClientStartedConversation(async () => false);
  stubMessagePersistence();

  await createMessage(
    {
      user: makeUser(barberId, "barber"),
      body: { receiverId: clientId, text: "Hello" },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.deepEqual(checkedRelationship, { barberId, clientId });
});

test("createMessage allows barber reply to existing client-started conversation", async () => {
  const res = createResponse();
  let checkedConversation = null;
  stubReceiver(makeUser(clientId, "client"));
  __messageAccessTestHooks.setHasBookingRelationship(async () => false);
  __messageAccessTestHooks.setHasClientStartedConversation(async (conversation) => {
    checkedConversation = conversation;
    return true;
  });
  stubMessagePersistence();

  await createMessage(
    {
      user: makeUser(barberId, "barber"),
      body: { receiverId: clientId, text: "Hello" },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.deepEqual(checkedConversation, { barberId, clientId });
});

test("createMessage returns 404 for missing receiver", async () => {
  const res = createResponse();
  let createCalled = false;
  stubReceiver(null);
  Message.create = async () => {
    createCalled = true;
  };

  await createMessage(
    {
      user: makeUser(clientId, "client"),
      body: { receiverId: barberId, text: "Hello" },
    },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Receiver not found");
  assert.equal(createCalled, false);
});
