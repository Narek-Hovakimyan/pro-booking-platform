import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";

import { MEDIA_STORE_ERROR_CODES } from "./mediaStore.js";
import LocalMediaStore from "./localMediaStore.js";

const tempRoots = [];
const stores = [];
const originalLink = fs.link;
const originalRename = fs.rename;
const originalGeteuid = process.geteuid;

const makeTempRoot = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hairbook-media-"));
  tempRoots.push(root);
  return root;
};

const readStreamText = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};

const makeStore = (options) => {
  const store = new LocalMediaStore(options);
  stores.push(store);
  return store;
};

afterEach(async () => {
  fs.link = originalLink;
  fs.rename = originalRename;
  process.geteuid = originalGeteuid;
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      fs.rm(root, {
        recursive: true,
        force: true,
      })
    )
  );
});

describe("LocalMediaStore", () => {
  test("stages, promotes, reads, and idempotently deletes media", async () => {
    const store = makeStore({ root: await makeTempRoot() });
    const staged = await store.stage({ buffer: Buffer.from("hello"), extension: ".jpg" });

    assert.match(staged.storageKey, /^[0-9a-f-]{36}\.jpg$/);
    assert.equal(staged.provider, "local");
    assert.equal(staged.bytes, 5);

    const promoted = await store.promote(staged);
    assert.deepEqual(promoted, {
      provider: "local",
      storageKey: staged.storageKey,
      promoted: true,
    });

    assert.equal(await readStreamText(await store.createReadStream(staged.storageKey)), "hello");
    assert.equal((await store.delete(staged.storageKey)).deleted, true);
    assert.equal((await store.delete(staged.storageKey)).deleted, false);
  });

  test("stages with caller-preallocated UUID keys", async () => {
    const store = makeStore({ root: await makeTempRoot() });
    const staged = await store.stage({
      buffer: Buffer.from("hello"),
      extension: ".jpg",
      storageKey: "11111111-1111-4111-8111-111111111111.jpg",
      stageKey: "11111111-1111-4111-8111-111111111111.stage",
    });

    assert.deepEqual(staged, {
      provider: "local",
      storageKey: "11111111-1111-4111-8111-111111111111.jpg",
      stageKey: "11111111-1111-4111-8111-111111111111.stage",
      bytes: 5,
    });
  });

  test("stages stream bodies with exclusive collision handling", async () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    const store = makeStore({
      root: await makeTempRoot(),
      uuidFactory: () => uuid,
    });

    const first = await store.stage({
      stream: Readable.from(["streamed"]),
      extension: "png",
    });

    await assert.rejects(
      () => store.stage({ buffer: "collision", extension: "png" }),
      { code: MEDIA_STORE_ERROR_CODES.KEY_COLLISION }
    );
    assert.equal(first.storageKey, `${uuid}.png`);
  });

  test("rejects traversal, absolute caller keys, and escaped configured roots", async () => {
    const baseRoot = await makeTempRoot();
    const store = makeStore({ root: baseRoot });

    await assert.rejects(() => store.createReadStream("../secret"), {
      code: MEDIA_STORE_ERROR_CODES.INVALID_KEY,
    });
    await assert.rejects(() => store.delete(path.resolve("/tmp/secret")), {
      code: MEDIA_STORE_ERROR_CODES.INVALID_KEY,
    });
    await assert.rejects(
      () =>
        store.promote({
          stageKey: "11111111-1111-4111-8111-111111111111.stage",
          storageKey: "22222222-2222-4222-8222-222222222222.jpg",
        }),
      { code: MEDIA_STORE_ERROR_CODES.INVALID_KEY }
    );

    const escapedStore = makeStore({
      root: baseRoot,
      activeRoot: path.join(baseRoot, "..", "escaped"),
    });
    await assert.rejects(() => escapedStore.stage({ buffer: "x", extension: ".jpg" }), {
      code: MEDIA_STORE_ERROR_CODES.STORAGE_UNAVAILABLE,
    });
  });

  test("rejects symlinked roots and ancestor directory symlinks", async () => {
    const baseRoot = await makeTempRoot();
    const realRoot = path.join(baseRoot, "real-root");
    const linkedRoot = path.join(baseRoot, "linked-root");
    await fs.mkdir(realRoot);
    await fs.symlink(realRoot, linkedRoot);

    const rootStore = makeStore({ root: linkedRoot });
    await assert.rejects(() => rootStore.stage({ buffer: "x", extension: ".jpg" }), {
      code: MEDIA_STORE_ERROR_CODES.SYMLINK_DETECTED,
    });

    const confinedRoot = await makeTempRoot();
    const outsideRoot = await makeTempRoot();
    await fs.mkdir(path.join(outsideRoot, "nested"), { recursive: true });
    await fs.mkdir(path.join(confinedRoot, "objects"), { recursive: true });
    await fs.rm(path.join(confinedRoot, "objects"), { recursive: true, force: true });
    await fs.symlink(path.join(outsideRoot, "nested"), path.join(confinedRoot, "objects"));

    const store = makeStore({ root: confinedRoot });
    await assert.rejects(() => store.stage({ buffer: "safe", extension: ".webp" }), {
      code: MEDIA_STORE_ERROR_CODES.SYMLINK_DETECTED,
    });
  });

  test("rejects symlink reads and deletes without touching outside targets", async () => {
    const root = await makeTempRoot();
    const store = makeStore({ root });
    const staged = await store.stage({ buffer: "safe", extension: ".webp" });
    await store.promote(staged);

    const activePath = path.join(root, "objects", staged.storageKey);
    const outside = path.join(root, "outside.txt");
    await fs.writeFile(outside, "outside", "utf8");
    await fs.unlink(activePath);
    await fs.symlink(outside, activePath);

    await assert.rejects(() => store.createReadStream(staged.storageKey), {
      code: MEDIA_STORE_ERROR_CODES.SYMLINK_DETECTED,
    });
    await assert.rejects(() => store.delete(staged.storageKey), {
      code: MEDIA_STORE_ERROR_CODES.SYMLINK_DETECTED,
    });
    assert.equal(await fs.readFile(outside, "utf8"), "outside");
  });

  test("fails closed when promote verification detects a swapped target", async () => {
    const root = await makeTempRoot();
    const outside = path.join(root, "outside.txt");
    await fs.writeFile(outside, "outside", "utf8");

    fs.link = async (sourcePath, targetPath) => {
      await fs.symlink(outside, targetPath);
      return undefined;
    };

    const store = makeStore({ root });
    const staged = await store.stage({ buffer: "safe", extension: ".png" });

    await assert.rejects(() => store.promote(staged), {
      code: MEDIA_STORE_ERROR_CODES.SYMLINK_DETECTED,
    });
    await assert.rejects(() => fs.lstat(path.join(root, "objects", staged.storageKey)), {
      code: "ENOENT",
    });
  });

  test("copies the opened staged descriptor when its pathname is swapped", async () => {
    const root = await makeTempRoot();
    const store = makeStore({ root });
    const staged = await store.stage({ buffer: "safe", extension: ".png" });
    const stagePath = path.join(root, "staging", staged.stageKey);

    fs.link = async (sourcePath, targetPath) => {
      await fs.unlink(stagePath);
      await fs.writeFile(stagePath, "swapped", "utf8");
      return originalLink(sourcePath, targetPath);
    };

    await store.promote(staged);
    assert.equal(await readStreamText(await store.createReadStream(staged.storageKey)), "safe");
  });

  test("keeps using pinned directories when configured pathnames are replaced", async () => {
    const root = await makeTempRoot();
    const outside = await makeTempRoot();
    const store = makeStore({ root });
    await store.stage({ buffer: "initial", extension: ".jpg" });
    const movedRoot = root + "-moved";
    tempRoots.push(movedRoot);

    await fs.rename(root, movedRoot);
    await fs.symlink(outside, root);
    const staged = await store.stage({ buffer: "pinned", extension: ".jpg" });

    assert.equal(
      await fs.readFile(path.join(movedRoot, "staging", staged.stageKey), "utf8"),
      "pinned"
    );
    await assert.rejects(() => fs.access(path.join(outside, "staging", staged.stageKey)));
  });

  test("uses a private tombstone and leaves swapped outside targets untouched", async () => {
    const root = await makeTempRoot();
    const store = makeStore({ root });
    const staged = await store.stage({ buffer: "safe", extension: ".jpg" });
    await store.promote(staged);
    const activePath = path.join(root, "objects", staged.storageKey);
    const outside = path.join(root, "outside.txt");
    await fs.writeFile(outside, "outside", "utf8");

    fs.rename = async (sourcePath, targetPath) => {
      await fs.unlink(sourcePath);
      await fs.symlink(outside, sourcePath);
      return originalRename(sourcePath, targetPath);
    };

    await assert.rejects(() => store.delete(staged.storageKey), {
      code: MEDIA_STORE_ERROR_CODES.SYMLINK_DETECTED,
    });
    assert.equal(await fs.readFile(outside, "utf8"), "outside");
    await assert.rejects(() => fs.lstat(activePath), { code: "ENOENT" });
  });

  test("fails before storage access when descriptor safety is unsupported", async () => {
    const root = await makeTempRoot();
    const store = makeStore({ root, platform: "win32" });

    await assert.rejects(() => store.stage({ buffer: "x", extension: ".jpg" }), {
      code: MEDIA_STORE_ERROR_CODES.UNSUPPORTED_SAFETY,
    });
    await assert.rejects(() => fs.access(path.join(root, "staging")), { code: "ENOENT" });
  });

  test("fails closed when runtime effective ownership cannot be determined", async () => {
    const root = await makeTempRoot();
    process.geteuid = undefined;
    const store = makeStore({ root });

    await assert.rejects(() => store.stage({ buffer: "x", extension: ".jpg" }), {
      code: MEDIA_STORE_ERROR_CODES.UNSUPPORTED_SAFETY,
    });
    await assert.rejects(() => fs.access(path.join(root, "staging")), { code: "ENOENT" });
  });

  test("ignores caller uid overrides and rejects roots owned by another effective user", async () => {
    const root = await makeTempRoot();
    const runtimeUid = originalGeteuid?.();
    process.geteuid = () => runtimeUid + 1;
    const store = makeStore({ root, uid: runtimeUid });

    await assert.rejects(() => store.stage({ buffer: "x", extension: ".jpg" }), {
      code: MEDIA_STORE_ERROR_CODES.STORAGE_UNAVAILABLE,
    });
  });

  test("keeps process-owned roots working when caller supplies a fake uid option", async () => {
    const store = makeStore({ root: await makeTempRoot(), uid: -1 });
    const staged = await store.stage({ buffer: "safe", extension: ".jpg" });

    assert.match(staged.storageKey, /^[0-9a-f-]{36}\.jpg$/);
  });

  test("redacts absolute paths from unavailable storage errors", async () => {
    const root = await makeTempRoot();
    const rootFile = path.join(root, "not-a-directory");
    await fs.writeFile(rootFile, "blocked", "utf8");
    const store = makeStore({ root: rootFile });

    await assert.rejects(
      () => store.stage({ buffer: "x", extension: ".jpg" }),
      (error) => {
        assert.equal(error.code, MEDIA_STORE_ERROR_CODES.STORAGE_UNAVAILABLE);
        assert.equal(error.message.includes(rootFile), false);
        assert.equal(JSON.stringify(error).includes(rootFile), false);
        assert.equal(JSON.stringify(error.cause || {}).includes(rootFile), false);
        return true;
      }
    );
  });
});
