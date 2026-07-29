import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  MEDIA_STORE_ERROR_CODES,
  MediaStore,
  MediaStoreError,
  isMediaStoreError,
  resolveMediaStageKeys,
} from "./mediaStore.js";

describe("MediaStore contract", () => {
  test("base operations fail with structured not-implemented errors", async () => {
    const store = new MediaStore();

    await assert.rejects(() => store.stage(), (error) => {
      assert.equal(error.code, MEDIA_STORE_ERROR_CODES.NOT_IMPLEMENTED);
      assert.equal(error.operation, "stage");
      assert.equal(error.status, 501);
      assert.equal(isMediaStoreError(error), true);
      return true;
    });
  });

  test("errors serialize without leaking implementation causes", () => {
    const cause = new Error("/srv/private/uploads/object");
    const error = new MediaStoreError(MEDIA_STORE_ERROR_CODES.STORAGE_UNAVAILABLE, {
      operation: "stage",
      cause,
      retryable: true,
    });

    assert.equal(error.message.includes("/srv/private"), false);
    assert.deepEqual(error.toJSON(), {
      code: MEDIA_STORE_ERROR_CODES.STORAGE_UNAVAILABLE,
      message: "Media storage is unavailable",
      operation: "stage",
      status: 503,
      retryable: true,
      cause: {
        name: "Error",
        message: "[redacted]",
      },
    });
    assert.equal(error.cause.message.includes("/srv/private"), false);
  });

  test("nested causes are recursively redacted", () => {
    const error = new MediaStoreError(MEDIA_STORE_ERROR_CODES.WRITE_FAILED, {
      operation: "stage",
      cause: {
        path: "/srv/private/uploads/object",
        cause: new Error("write /srv/private/staging/file failed"),
      },
    });

    assert.deepEqual(error.toJSON(), {
      code: MEDIA_STORE_ERROR_CODES.WRITE_FAILED,
      message: "Could not stage media object",
      operation: "stage",
      status: 500,
      retryable: false,
      cause: {
        path: "[redacted]",
        cause: {
          name: "Error",
          message: "write [redacted] failed",
        },
      },
    });
  });

  test("redacts embedded POSIX and Windows paths in cyclic nested causes", () => {
    const cycle = {
      detail: "source=/srv/private/media.bin",
      values: ["copy=C:\\media\\private\\object.jpg", { location: "/var/lib/media" }],
    };
    cycle.self = cycle;
    const error = new MediaStoreError(MEDIA_STORE_ERROR_CODES.WRITE_FAILED, {
      cause: cycle,
    });
    const serialized = JSON.stringify(error.toJSON());

    assert.equal(serialized.includes("/srv/private"), false);
    assert.equal(serialized.includes("C:\\media\\private"), false);
    assert.equal(serialized.includes("/var/lib/media"), false);
    assert.equal(error.cause.self, "[redacted]");
  });

  test("supports caller-preallocated stage and storage keys", () => {
    const generated = resolveMediaStageKeys({
      extension: ".jpg",
      uuidFactory: () => "11111111-1111-4111-8111-111111111111",
    });
    const preserved = resolveMediaStageKeys({
      storageKey: "22222222-2222-4222-8222-222222222222.webp",
      stageKey: "22222222-2222-4222-8222-222222222222.stage",
      extension: ".webp",
    });

    assert.deepEqual(generated, {
      storageKey: "11111111-1111-4111-8111-111111111111.jpg",
      stageKey: "11111111-1111-4111-8111-111111111111.stage",
    });
    assert.deepEqual(preserved, {
      storageKey: "22222222-2222-4222-8222-222222222222.webp",
      stageKey: "22222222-2222-4222-8222-222222222222.stage",
    });
  });
});
