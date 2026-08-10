import assert from "node:assert/strict";
import test from "node:test";

import {
  getControllerErrorStatusCode,
  sendControllerError,
} from "./controllerError.js";

const createResponse = ({ req } = {}) => ({
  req,
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

const createRequestLogger = ({ throws = false } = {}) => {
  const calls = [];
  return {
    calls,
    error(...args) {
      calls.push(args);
      if (throws) {
        throw new Error("logger failed");
      }
    },
  };
};

test("getControllerErrorStatusCode preserves duplicate key, explicit, validation, cast, and fallback branches", () => {
  assert.equal(getControllerErrorStatusCode({ code: 11000 }), 409);
  assert.equal(
    getControllerErrorStatusCode({ code: 11000 }, { duplicateKeyStatus: 400 }),
    400
  );
  assert.equal(getControllerErrorStatusCode({ statusCode: 418 }), 418);
  assert.equal(getControllerErrorStatusCode({ name: "ValidationError" }), 400);
  assert.equal(getControllerErrorStatusCode({ name: "CastError" }), 400);
  assert.equal(getControllerErrorStatusCode({}), 500);
  assert.equal(
    getControllerErrorStatusCode({}, { fallbackStatus: 503 }),
    503
  );
});

test("sendControllerError logs only fixed structured metadata with validated userId", () => {
  const logger = createRequestLogger();
  const res = createResponse({
    req: {
      log: logger,
      user: {
        _id: "64b000000000000000000003",
        email: "hidden@example.com",
      },
      body: { token: "secret" },
      params: { id: "../../etc/passwd" },
      headers: { authorization: "Bearer secret" },
    },
  });
  const error = new Error("/private/tmp/secret");
  error.statusCode = 500;
  error.code = "ENOENT";
  error.stack = "stack";

  sendControllerError(res, error, "Could not fetch record");

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Could not fetch record" });
  assert.deepEqual(logger.calls, [[{
    err: { name: "Error" },
    event: "controller.error",
    statusCode: 500,
    userId: "64b000000000000000000003",
  }]]);
  assert.equal(JSON.stringify(logger.calls).includes("secret"), false);
  assert.equal(JSON.stringify(logger.calls).includes("hidden@example.com"), false);
  assert.equal(JSON.stringify(logger.calls).includes("/private/tmp"), false);
  assert.equal(JSON.stringify(logger.calls).includes("../../etc/passwd"), false);
});

test("sendControllerError omits invalid userId and survives missing or throwing logger", () => {
  const resWithoutLogger = createResponse({
    req: { user: { _id: "../../not-an-objectid" } },
  });
  const badRequestError = new Error("validation");
  badRequestError.name = "ValidationError";

  sendControllerError(resWithoutLogger, badRequestError, "fallback");
  assert.equal(resWithoutLogger.statusCode, 400);
  assert.deepEqual(resWithoutLogger.body, { message: "validation" });

  const throwingLogger = createRequestLogger({ throws: true });
  const resWithThrowingLogger = createResponse({
    req: {
      log: throwingLogger,
      user: { _id: "64b000000000000000000003" },
    },
  });
  const duplicateError = new Error("dup");
  duplicateError.code = 11000;

  sendControllerError(resWithThrowingLogger, duplicateError, "fallback", {
    duplicateKeyMessage: "Already exists",
    duplicateKeyStatus: 400,
  });

  assert.equal(resWithThrowingLogger.statusCode, 400);
  assert.deepEqual(resWithThrowingLogger.body, { message: "Already exists" });
  assert.equal(throwingLogger.calls.length, 1);
  assert.deepEqual(throwingLogger.calls[0], [{
    err: { name: "Error" },
    event: "controller.error",
    statusCode: 400,
    userId: "64b000000000000000000003",
  }]);
});

test("sendControllerError preserves explicit status and fallback response bodies exactly", () => {
  const explicitStatusResponse = createResponse();
  const explicitStatusError = new Error("Denied");
  explicitStatusError.statusCode = 403;

  sendControllerError(
    explicitStatusResponse,
    explicitStatusError,
    "Could not proceed"
  );
  assert.equal(explicitStatusResponse.statusCode, 403);
  assert.deepEqual(explicitStatusResponse.body, { message: "Denied" });

  const fallbackResponse = createResponse();
  const fallbackError = new Error("raw internal error");
  fallbackError.statusCode = "500 ../../private";

  sendControllerError(fallbackResponse, fallbackError, "Could not proceed");
  assert.equal(fallbackResponse.statusCode, "500 ../../private");
  assert.deepEqual(fallbackResponse.body, { message: "raw internal error" });
});
