import assert from "node:assert/strict";
import { describe, test } from "node:test";

import MediaObject, { MEDIA_OBJECT_STATES } from "./MediaObject.js";

describe("MediaObject", () => {
  test("declares immutable unique storage keys", () => {
    assert.equal(MediaObject.schema.path("storageKey").options.immutable, true);
    assert.deepEqual(
      MediaObject.schema.indexes().find(([fields]) => fields.storageKey === 1),
      [
        { storageKey: 1 },
        { unique: true, name: "mediaobjects_storageKey_unique" },
      ]
    );
  });

  test("defaults to staged lifecycle metadata", async () => {
    const media = new MediaObject({
      storageKey: "11111111-1111-4111-8111-111111111111.jpg",
      contentType: "image/jpeg",
      byteSize: 7,
    });

    await media.validate();

    assert.equal(media.provider, "local");
    assert.equal(media.status, MEDIA_OBJECT_STATES.STAGED);
    assert.ok(media.stagedAt instanceof Date);
  });

  test("applies the default status when omitted or undefined", async () => {
    const omitted = new MediaObject({
      storageKey: "66666666-6666-4666-8666-666666666666.jpg",
    });
    const explicitUndefined = new MediaObject({
      storageKey: "77777777-7777-4777-8777-777777777777.jpg",
      status: undefined,
    });

    await Promise.all([omitted.validate(), explicitUndefined.validate()]);

    assert.equal(omitted.status, MEDIA_OBJECT_STATES.STAGED);
    assert.equal(explicitUndefined.status, MEDIA_OBJECT_STATES.STAGED);
  });

  test("sets lifecycle timestamps for terminal states", async () => {
    const active = new MediaObject({
      storageKey: "22222222-2222-4222-8222-222222222222.jpg",
      status: MEDIA_OBJECT_STATES.ACTIVE,
    });
    const deletePending = new MediaObject({
      storageKey: "33333333-3333-4333-8333-333333333333.jpg",
      status: MEDIA_OBJECT_STATES.DELETE_PENDING,
    });
    const deleted = new MediaObject({
      storageKey: "44444444-4444-4444-8444-444444444444.jpg",
      status: MEDIA_OBJECT_STATES.DELETED,
    });
    const failed = new MediaObject({
      storageKey: "55555555-5555-4555-8555-555555555555.jpg",
      status: MEDIA_OBJECT_STATES.FAILED,
    });

    await Promise.all([
      active.validate(),
      deletePending.validate(),
      deleted.validate(),
      failed.validate(),
    ]);

    assert.ok(active.activatedAt instanceof Date);
    assert.ok(deletePending.deletePendingAt instanceof Date);
    assert.ok(deleted.deletedAt instanceof Date);
    assert.ok(failed.failedAt instanceof Date);
  });

  test("accepts every supported lifecycle state", async () => {
    await Promise.all(
      Object.values(MEDIA_OBJECT_STATES).map((status, index) =>
        new MediaObject({
          storageKey: `88888888-8888-4888-8888-${String(index + 1).padStart(12, "0")}.jpg`,
          status,
        }).validate()
      )
    );
  });

  test("rejects null, empty, and unknown lifecycle states", async () => {
    await Promise.all([
      assert.rejects(
        () => new MediaObject({
          storageKey: "99999999-9999-4999-8999-999999999999.jpg",
          status: null,
        }).validate(),
        /validation/i
      ),
      assert.rejects(
        () => new MediaObject({
          storageKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg",
          status: "",
        }).validate(),
        /validation/i
      ),
      assert.rejects(
        () => new MediaObject({
          storageKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg",
          status: "unknown",
        }).validate(),
        /validation/i
      ),
    ]);
  });

  test("rejects path-like storage keys", async () => {
    await assert.rejects(
      () => new MediaObject({
        storageKey: "../escape.jpg",
      }).validate(),
      /validation/i
    );
  });
});
