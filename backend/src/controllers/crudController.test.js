import assert from "node:assert/strict";
import { test } from "node:test";

import { createCrudController } from "./crudController.js";

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

const createError = (name, message) => {
  const error = new Error(message);
  error.name = name;
  return error;
};

test("generated create returns 400 for validation errors", async () => {
  const Model = {
    create: async () => {
      throw createError("ValidationError", "name is required");
    },
  };
  const controller = createCrudController(Model, "Thing");
  const res = createResponse();

  await controller.create({ body: {} }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "name is required");
});

test("generated create returns 409 generic for duplicate key errors", async () => {
  const duplicateError = new Error("E11000 duplicate key raw index details");
  duplicateError.code = 11000;
  const Model = {
    create: async () => {
      throw duplicateError;
    },
  };
  const controller = createCrudController(Model, "Thing");
  const res = createResponse();

  await controller.create({ body: {} }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, "Thing already exists");
  assert.equal(res.body.message.includes("E11000"), false);
});

test("generated create returns 500 generic for unexpected errors", async () => {
  const Model = {
    create: async () => {
      throw new Error("raw database failure");
    },
  };
  const controller = createCrudController(Model, "Thing");
  const res = createResponse();

  await withSilencedConsoleError(async () => {
    await controller.create({ body: {} }, res);
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not create Thing");
  assert.equal(res.body.message.includes("raw database failure"), false);
});

test("generated update returns 400 for cast and validation errors", async () => {
  for (const errorName of ["CastError", "ValidationError"]) {
    const Model = {
      findByIdAndUpdate: async () => {
        throw createError(errorName, `${errorName} details`);
      },
    };
    const controller = createCrudController(Model, "Thing");
    const res = createResponse();

    await controller.update({ params: { id: "bad-id" }, body: {} }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, `${errorName} details`);
  }
});

test("generated update returns 500 generic for unexpected errors", async () => {
  const Model = {
    findByIdAndUpdate: async () => {
      throw new Error("raw update database failure");
    },
  };
  const controller = createCrudController(Model, "Thing");
  const res = createResponse();

  await withSilencedConsoleError(async () => {
    await controller.update({ params: { id: "thing-id" }, body: {} }, res);
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not update Thing");
  assert.equal(res.body.message.includes("raw update database failure"), false);
});

test("generated update still returns 404 for missing document", async () => {
  const Model = {
    findByIdAndUpdate: async () => null,
  };
  const controller = createCrudController(Model, "Thing");
  const res = createResponse();

  await controller.update({ params: { id: "missing-id" }, body: {} }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Thing not found");
});
