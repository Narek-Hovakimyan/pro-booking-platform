import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { MEDIA_OBJECT_STATES } from "../../models/MediaObject.js";
import {
  __portfolioMediaServiceTestHooks,
  createPortfolioPhotoWithMedia,
  deletePortfolioPhotoWithMedia,
  hasBoundPortfolioMedia,
  openPortfolioPhotoMedia,
} from "./portfolioMediaService.js";

const matchesQuery = (doc, query) =>
  Object.entries(query).every(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if ("$in" in value) return value.$in.includes(doc[key]);
    }
    return String(doc[key]) === String(value);
  });

const createMediaObjectModel = () => {
  const docs = [];
  return {
    docs,
    async create(payload) {
      const doc = {
        ownerModel: "",
        ownerId: null,
        stageKey: "",
        failureCode: "",
        failureReason: "",
        ...payload,
      };
      docs.push(doc);
      return doc;
    },
    async findByIdAndUpdate(id, update) {
      const doc = docs.find((entry) => String(entry._id) === String(id));
      if (!doc) return null;
      Object.assign(doc, update.$set || {});
      return doc;
    },
    async findOneAndUpdate(query, update) {
      const doc = docs.find((entry) => matchesQuery(entry, query));
      if (!doc) return null;
      Object.assign(doc, update.$set || {});
      return doc;
    },
    findOne(query) {
      const doc = docs.find((entry) => matchesQuery(entry, query)) || null;
      return {
        async lean() {
          return doc;
        },
      };
    },
  };
};

const createPortfolioPhotoModel = () => {
  const docs = [];
  return {
    docs,
    async findOneAndUpdate(query, update) {
      let doc = docs.find((entry) => matchesQuery(entry, query));
      if (!doc && update.$setOnInsert) {
        doc = { ...update.$setOnInsert };
        docs.push(doc);
      }
      return doc || null;
    },
    async findByIdAndUpdate(id, update) {
      const doc = docs.find((entry) => String(entry._id) === String(id));
      if (!doc) return null;
      Object.assign(doc, update.$set || {});
      return doc;
    },
    findOne(query) {
      const doc = docs.find((entry) => matchesQuery(entry, query)) || null;
      return {
        select() {
          return {
            async lean() {
              return doc;
            },
          };
        },
      };
    },
  };
};

const createMediaStore = (overrides = {}) => ({
  staged: [],
  promoted: [],
  deleted: [],
  async stage({ extension, storageKey, stageKey }) {
    const result = {
      provider: "local",
      storageKey,
      stageKey,
      bytes: extension ? 12 : 10,
    };
    this.staged.push(result);
    return result;
  },
  async promote({ storageKey, stageKey }) {
    this.promoted.push({ storageKey, stageKey });
    return { provider: "local", storageKey, promoted: true };
  },
  async delete(storageKey) {
    this.deleted.push(storageKey);
    return { provider: "local", storageKey, deleted: true };
  },
  async createReadStream(storageKey) {
    return `stream:${storageKey}`;
  },
  ...overrides,
});

const createSession = ({ retries = 1, failure } = {}) => ({
  async withTransaction(callback) {
    for (let index = 0; index < retries; index += 1) {
      await callback();
    }
    if (failure) throw failure;
  },
  async endSession() {},
});

const createMongoLabelError = (message, labels) => {
  const error = new Error(message);
  error.errorLabels = labels;
  error.hasErrorLabel = (label) => labels.includes(label);
  return error;
};

afterEach(() => {
  __portfolioMediaServiceTestHooks.resetMediaStore();
  __portfolioMediaServiceTestHooks.resetLogger();
  __portfolioMediaServiceTestHooks.resetSupportsTransactions();
  __portfolioMediaServiceTestHooks.resetStartSession();
});

test("creates a portfolio photo and binds exact before/after MediaObjects", async () => {
  const PortfolioPhotoModel = createPortfolioPhotoModel();
  const MediaObjectModel = createMediaObjectModel();
  const mediaStore = createMediaStore();
  const session = createSession();

  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => true);
  __portfolioMediaServiceTestHooks.setStartSession(async () => session);

  const photo = await createPortfolioPhotoWithMedia({
    payload: {
      _id: "64c000000000000000000100",
      barberId: "64c000000000000000000001",
      beforeUrl: "/uploads/portfolio/portfolio-before.jpg",
      afterUrl: "/uploads/portfolio/portfolio-after.jpg",
      isPublic: true,
      consentConfirmed: true,
    },
    filesByKind: {
      before: {
        filename: "portfolio-before.jpg",
        originalname: "before.jpg",
        mimetype: "image/jpeg",
        size: 11,
        buffer: Buffer.from("before"),
      },
      after: {
        filename: "portfolio-after.jpg",
        originalname: "after.jpg",
        mimetype: "image/jpeg",
        size: 10,
        buffer: Buffer.from("after"),
      },
    },
    PortfolioPhotoModel,
    MediaObjectModel,
    mediaStore,
  });

  assert.equal(String(photo._id), "64c000000000000000000100");
  assert.equal(PortfolioPhotoModel.docs.length, 1);
  assert.equal(mediaStore.promoted.length, 2);
  assert.equal(
    MediaObjectModel.docs.filter((doc) => doc.status === MEDIA_OBJECT_STATES.ACTIVE).length,
    2
  );
  assert.ok(hasBoundPortfolioMedia(PortfolioPhotoModel.docs[0], "before"));
  assert.ok(hasBoundPortfolioMedia(PortfolioPhotoModel.docs[0], "after"));
});

test("transaction callback retries stay idempotent and do not duplicate side effects", async () => {
  const PortfolioPhotoModel = createPortfolioPhotoModel();
  const MediaObjectModel = createMediaObjectModel();
  const mediaStore = createMediaStore();
  const session = createSession({ retries: 2 });

  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => true);
  __portfolioMediaServiceTestHooks.setStartSession(async () => session);

  await createPortfolioPhotoWithMedia({
    payload: {
      _id: "64c000000000000000000101",
      barberId: "64c000000000000000000001",
      beforeUrl: "/uploads/portfolio/retry-before.jpg",
      afterUrl: "/uploads/portfolio/retry-after.jpg",
    },
    filesByKind: {
      before: {
        filename: "retry-before.jpg",
        originalname: "before.jpg",
        mimetype: "image/jpeg",
        buffer: Buffer.from("before"),
      },
      after: {
        filename: "retry-after.jpg",
        originalname: "after.jpg",
        mimetype: "image/jpeg",
        buffer: Buffer.from("after"),
      },
    },
    PortfolioPhotoModel,
    MediaObjectModel,
    mediaStore,
  });

  assert.equal(PortfolioPhotoModel.docs.length, 1);
  assert.equal(mediaStore.promoted.length, 2);
  assert.equal(
    MediaObjectModel.docs.filter((doc) => doc.status === MEDIA_OBJECT_STATES.ACTIVE).length,
    2
  );
});

test("unsupported transactions fail closed before staging begins", async () => {
  const mediaStore = createMediaStore({
    async stage() {
      throw new Error("stage should not run");
    },
  });

  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => false);

  await assert.rejects(
    () =>
      createPortfolioPhotoWithMedia({
        payload: {
          _id: "64c000000000000000000102",
          beforeUrl: "/uploads/portfolio/unsupported-before.jpg",
          afterUrl: "/uploads/portfolio/unsupported-after.jpg",
        },
        filesByKind: {
          before: { filename: "unsupported-before.jpg", originalname: "before.jpg" },
          after: { filename: "unsupported-after.jpg", originalname: "after.jpg" },
        },
        PortfolioPhotoModel: createPortfolioPhotoModel(),
        MediaObjectModel: createMediaObjectModel(),
        mediaStore,
      }),
    /transaction support/
  );

  assert.equal(mediaStore.staged.length, 0);
});

test("partial two-file staging failure keeps tracked intents and marks the failed one", async () => {
  const MediaObjectModel = createMediaObjectModel();
  let attempts = 0;
  const mediaStore = createMediaStore({
    async stage(args) {
      attempts += 1;
      if (attempts === 2) throw new Error("storage offline");
      return createMediaStore().stage.call(this, args);
    },
  });

  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => true);
  __portfolioMediaServiceTestHooks.setStartSession(async () => createSession());

  await assert.rejects(
    () =>
      createPortfolioPhotoWithMedia({
        payload: {
          _id: "64c000000000000000000103",
          beforeUrl: "/uploads/portfolio/fail-before.jpg",
          afterUrl: "/uploads/portfolio/fail-after.jpg",
        },
        filesByKind: {
          before: {
            filename: "fail-before.jpg",
            originalname: "before.jpg",
            buffer: Buffer.from("before"),
          },
          after: {
            filename: "fail-after.jpg",
            originalname: "after.jpg",
            buffer: Buffer.from("after"),
          },
        },
        PortfolioPhotoModel: createPortfolioPhotoModel(),
        MediaObjectModel,
        mediaStore,
      }),
    /storage offline/
  );

  assert.equal(MediaObjectModel.docs[0].status, MEDIA_OBJECT_STATES.STAGED);
  assert.equal(MediaObjectModel.docs[0].failureCode, "PORTFOLIO_MEDIA_STAGE_INCOMPLETE");
  assert.equal(MediaObjectModel.docs[1].status, MEDIA_OBJECT_STATES.FAILED);
  assert.equal(MediaObjectModel.docs[1].failureCode, "PORTFOLIO_MEDIA_STAGE_FAILED");
});

test("transaction failure after promotion marks media delete-pending then deleted", async () => {
  const PortfolioPhotoModel = createPortfolioPhotoModel();
  const MediaObjectModel = createMediaObjectModel();
  const mediaStore = createMediaStore();

  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => true);
  __portfolioMediaServiceTestHooks.setStartSession(async () =>
    createSession({ failure: new Error("transaction aborted") })
  );

  await assert.rejects(
    () =>
      createPortfolioPhotoWithMedia({
        payload: {
          _id: "64c000000000000000000104",
          beforeUrl: "/uploads/portfolio/rollback-before.jpg",
          afterUrl: "/uploads/portfolio/rollback-after.jpg",
        },
        filesByKind: {
          before: {
            filename: "rollback-before.jpg",
            originalname: "before.jpg",
            buffer: Buffer.from("before"),
          },
          after: {
            filename: "rollback-after.jpg",
            originalname: "after.jpg",
            buffer: Buffer.from("after"),
          },
        },
        PortfolioPhotoModel,
        MediaObjectModel,
        mediaStore,
      }),
    /transaction aborted/
  );

  assert.equal(mediaStore.deleted.length, 2);
  assert.equal(
    MediaObjectModel.docs.filter((doc) => doc.status === MEDIA_OBJECT_STATES.DELETED).length,
    2
  );
});

test("unknown commit results reconcile exact committed photo and avoid compensation", async () => {
  const PortfolioPhotoModel = createPortfolioPhotoModel();
  const MediaObjectModel = createMediaObjectModel();
  const mediaStore = createMediaStore();

  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => true);
  __portfolioMediaServiceTestHooks.setStartSession(async () =>
    createSession({
      failure: createMongoLabelError("commit unknown", ["UnknownTransactionCommitResult"]),
    })
  );

  const photo = await createPortfolioPhotoWithMedia({
    payload: {
      _id: "64c000000000000000000109",
      beforeUrl: "/uploads/portfolio/unknown-before.jpg",
      afterUrl: "/uploads/portfolio/unknown-after.jpg",
    },
    filesByKind: {
      before: {
        filename: "unknown-before.jpg",
        originalname: "before.jpg",
        buffer: Buffer.from("before"),
      },
      after: {
        filename: "unknown-after.jpg",
        originalname: "after.jpg",
        buffer: Buffer.from("after"),
      },
    },
    PortfolioPhotoModel,
    MediaObjectModel,
    mediaStore,
  });

  assert.equal(String(photo._id), "64c000000000000000000109");
  assert.equal(mediaStore.deleted.length, 0);
  assert.equal(
    MediaObjectModel.docs.filter((doc) => doc.status === MEDIA_OBJECT_STATES.ACTIVE).length,
    2
  );
});

test("unresolved unknown commit returns 503 and leaves tracked media untouched", async () => {
  const PortfolioPhotoModel = createPortfolioPhotoModel();
  PortfolioPhotoModel.findOne = () => ({
    select() {
      return {
        async lean() {
          return null;
        },
      };
    },
  });
  const MediaObjectModel = createMediaObjectModel();
  const mediaStore = createMediaStore();

  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => true);
  __portfolioMediaServiceTestHooks.setStartSession(async () =>
    createSession({
      failure: createMongoLabelError("commit unknown", ["UnknownTransactionCommitResult"]),
    })
  );

  await assert.rejects(
    () =>
      createPortfolioPhotoWithMedia({
        payload: {
          _id: "64c000000000000000000110",
          beforeUrl: "/uploads/portfolio/ambiguous-before.jpg",
          afterUrl: "/uploads/portfolio/ambiguous-after.jpg",
        },
        filesByKind: {
          before: {
            filename: "ambiguous-before.jpg",
            originalname: "before.jpg",
            buffer: Buffer.from("before"),
          },
          after: {
            filename: "ambiguous-after.jpg",
            originalname: "after.jpg",
            buffer: Buffer.from("after"),
          },
        },
        PortfolioPhotoModel,
        MediaObjectModel,
        mediaStore,
      }),
    (error) =>
      error?.statusCode === 503 &&
      error?.retryable === true &&
      /commit outcome is unknown/i.test(error.message)
  );

  assert.equal(mediaStore.deleted.length, 0);
  assert.equal(
    MediaObjectModel.docs.filter((doc) => doc.status === MEDIA_OBJECT_STATES.DELETE_PENDING).length,
    0
  );
});

test("reconciliation I/O failure returns 503 and leaves tracked media untouched", async () => {
  const PortfolioPhotoModel = createPortfolioPhotoModel();
  PortfolioPhotoModel.findOne = () => ({
    select() {
      return {
        async lean() {
          throw new Error("reconcile read failed at /srv/private/media");
        },
      };
    },
  });
  const MediaObjectModel = createMediaObjectModel();
  const mediaStore = createMediaStore();

  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => true);
  __portfolioMediaServiceTestHooks.setStartSession(async () =>
    createSession({
      failure: createMongoLabelError("commit unknown", ["UnknownTransactionCommitResult"]),
    })
  );

  await assert.rejects(
    () =>
      createPortfolioPhotoWithMedia({
        payload: {
          _id: "64c000000000000000000111",
          beforeUrl: "/uploads/portfolio/reconcile-before.jpg",
          afterUrl: "/uploads/portfolio/reconcile-after.jpg",
        },
        filesByKind: {
          before: {
            filename: "reconcile-before.jpg",
            originalname: "before.jpg",
            buffer: Buffer.from("before"),
          },
          after: {
            filename: "reconcile-after.jpg",
            originalname: "after.jpg",
            buffer: Buffer.from("after"),
          },
        },
        PortfolioPhotoModel,
        MediaObjectModel,
        mediaStore,
      }),
    (error) =>
      error?.statusCode === 503 &&
      error?.retryable === true &&
      error?.message === "Portfolio media commit outcome is unknown; retry later"
  );

  assert.equal(mediaStore.deleted.length, 0);
  assert.equal(
    MediaObjectModel.docs.filter((doc) => doc.status === MEDIA_OBJECT_STATES.DELETE_PENDING).length,
    0
  );
});

test("cleanup after promotion uses tracked stage and storage keys", async () => {
  const PortfolioPhotoModel = createPortfolioPhotoModel();
  const MediaObjectModel = createMediaObjectModel();
  const mediaStore = createMediaStore();
  const originalFindOneAndUpdate = MediaObjectModel.findOneAndUpdate.bind(MediaObjectModel);
  const cleanupQueries = [];
  let writeCount = 0;

  MediaObjectModel.findOneAndUpdate = async (query, update) => {
    writeCount += 1;
    if (writeCount === 1) throw new Error("binding write failed");
    cleanupQueries.push(query);
    return originalFindOneAndUpdate(query, update);
  };

  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => true);
  __portfolioMediaServiceTestHooks.setStartSession(async () => createSession());

  await assert.rejects(
    () =>
      createPortfolioPhotoWithMedia({
        payload: {
          _id: "64c000000000000000000112",
          beforeUrl: "/uploads/portfolio/cleanup-before.jpg",
          afterUrl: "/uploads/portfolio/cleanup-after.jpg",
        },
        filesByKind: {
          before: {
            filename: "cleanup-before.jpg",
            originalname: "before.jpg",
            buffer: Buffer.from("before"),
          },
          after: {
            filename: "cleanup-after.jpg",
            originalname: "after.jpg",
            buffer: Buffer.from("after"),
          },
        },
        PortfolioPhotoModel,
        MediaObjectModel,
        mediaStore,
      }),
    /binding write failed/
  );

  const stagedCleanupQuery = cleanupQueries.find((query) => query.status === MEDIA_OBJECT_STATES.STAGED);
  assert.equal(mediaStore.deleted.length, 2);
  assert.ok(stagedCleanupQuery?.stageKey);
  assert.ok(stagedCleanupQuery?.storageKey);
  assert.equal(
    MediaObjectModel.docs.every((doc) => doc.status === MEDIA_OBJECT_STATES.DELETED),
    true
  );
});

test("cleanup leaves promoted media recoverable when delete-pending CAS cannot be persisted", async () => {
  const PortfolioPhotoModel = createPortfolioPhotoModel();
  const MediaObjectModel = createMediaObjectModel();
  const mediaStore = createMediaStore();
  const originalFindOneAndUpdate = MediaObjectModel.findOneAndUpdate.bind(MediaObjectModel);
  let writeCount = 0;

  MediaObjectModel.findOneAndUpdate = async (query, update) => {
    writeCount += 1;
    if (writeCount === 1) throw new Error("binding write failed");
    if (
      query?.status === MEDIA_OBJECT_STATES.STAGED ||
      query?.status === MEDIA_OBJECT_STATES.ACTIVE
    ) {
      return null;
    }
    return originalFindOneAndUpdate(query, update);
  };

  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => true);
  __portfolioMediaServiceTestHooks.setStartSession(async () => createSession());

  await assert.rejects(
    () =>
      createPortfolioPhotoWithMedia({
        payload: {
          _id: "64c000000000000000000113",
          beforeUrl: "/uploads/portfolio/recover-before.jpg",
          afterUrl: "/uploads/portfolio/recover-after.jpg",
        },
        filesByKind: {
          before: {
            filename: "recover-before.jpg",
            originalname: "before.jpg",
            buffer: Buffer.from("before"),
          },
          after: {
            filename: "recover-after.jpg",
            originalname: "after.jpg",
            buffer: Buffer.from("after"),
          },
        },
        PortfolioPhotoModel,
        MediaObjectModel,
        mediaStore,
      }),
    /binding write failed/
  );

  assert.equal(mediaStore.deleted.length, 0);
  assert.equal(
    MediaObjectModel.docs.every(
      (doc) =>
        doc.status === MEDIA_OBJECT_STATES.STAGED &&
        Boolean(doc.stageKey) &&
        Boolean(doc.storageKey)
    ),
    true
  );
});

test("delete marks the photo inactive and bound media deleted after confirmed deletion", async () => {
  const PortfolioPhotoModel = createPortfolioPhotoModel();
  PortfolioPhotoModel.docs.push({
    _id: "64c000000000000000000105",
    active: true,
  });
  const MediaObjectModel = createMediaObjectModel();
  MediaObjectModel.docs.push(
    {
      _id: "64c000000000000000000201",
      storageKey: "11111111-1111-4111-8111-111111111111.jpg",
      legacyUrl: "/uploads/portfolio/delete-before.jpg",
      mediaClass: "portfolio-before",
      ownerModel: "PortfolioPhoto",
      ownerId: "64c000000000000000000105",
      status: MEDIA_OBJECT_STATES.ACTIVE,
    },
    {
      _id: "64c000000000000000000202",
      storageKey: "22222222-2222-4222-8222-222222222222.jpg",
      legacyUrl: "/uploads/portfolio/delete-after.jpg",
      mediaClass: "portfolio-after",
      ownerModel: "PortfolioPhoto",
      ownerId: "64c000000000000000000105",
      status: MEDIA_OBJECT_STATES.ACTIVE,
    }
  );

  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => true);
  __portfolioMediaServiceTestHooks.setStartSession(async () => createSession());

  await deletePortfolioPhotoWithMedia({
    photo: {
      _id: "64c000000000000000000105",
      beforeUrl: "/uploads/portfolio/delete-before.jpg",
      afterUrl: "/uploads/portfolio/delete-after.jpg",
      beforeMediaObjectId: "64c000000000000000000201",
      afterMediaObjectId: "64c000000000000000000202",
    },
    PortfolioPhotoModel,
    MediaObjectModel,
    mediaStore: createMediaStore(),
  });

  assert.equal(PortfolioPhotoModel.docs[0].active, false);
  assert.equal(
    MediaObjectModel.docs.filter((doc) => doc.status === MEDIA_OBJECT_STATES.DELETED).length,
    2
  );
});

test("deletion cleanup failure leaves delete-pending media recoverable", async () => {
  const PortfolioPhotoModel = createPortfolioPhotoModel();
  PortfolioPhotoModel.docs.push({
    _id: "64c000000000000000000106",
    active: true,
  });
  const MediaObjectModel = createMediaObjectModel();
  MediaObjectModel.docs.push({
    _id: "64c000000000000000000203",
    storageKey: "33333333-3333-4333-8333-333333333333.jpg",
    legacyUrl: "/uploads/portfolio/delete-fail-before.jpg",
    mediaClass: "portfolio-before",
    ownerModel: "PortfolioPhoto",
    ownerId: "64c000000000000000000106",
    status: MEDIA_OBJECT_STATES.ACTIVE,
  });

  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => true);
  __portfolioMediaServiceTestHooks.setStartSession(async () => createSession());

  await deletePortfolioPhotoWithMedia({
    photo: {
      _id: "64c000000000000000000106",
      beforeUrl: "/uploads/portfolio/delete-fail-before.jpg",
      beforeMediaObjectId: "64c000000000000000000203",
    },
    PortfolioPhotoModel,
    MediaObjectModel,
    mediaStore: createMediaStore({
      async delete() {
        throw new Error("storage delete failed");
      },
    }),
  });

  assert.equal(PortfolioPhotoModel.docs[0].active, false);
  assert.equal(MediaObjectModel.docs[0].status, MEDIA_OBJECT_STATES.DELETE_PENDING);
  assert.equal(MediaObjectModel.docs[0].failureCode, "PORTFOLIO_MEDIA_DELETE_PENDING");
});

test("logs sanitized warning when stage failure persistence cannot be recorded", async () => {
  const logs = [];
  const MediaObjectModel = createMediaObjectModel();
  let updateAttempts = 0;
  MediaObjectModel.findByIdAndUpdate = async () => {
    updateAttempts += 1;
    throw new Error("write failed at /srv/private/portfolio");
  };

  __portfolioMediaServiceTestHooks.setLogger({
    warn: (...args) => logs.push(args),
  });
  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => true);
  __portfolioMediaServiceTestHooks.setStartSession(async () => createSession());

  await assert.rejects(
    () =>
      createPortfolioPhotoWithMedia({
        payload: {
          _id: "64c000000000000000000120",
          beforeUrl: "/uploads/portfolio/fail-before.jpg",
          afterUrl: "/uploads/portfolio/fail-after.jpg",
        },
        filesByKind: {
          before: {
            filename: "fail-before.jpg",
            originalname: "before.jpg",
            buffer: Buffer.from("before"),
          },
          after: {
            filename: "fail-after.jpg",
            originalname: "after.jpg",
            buffer: Buffer.from("after"),
          },
        },
        PortfolioPhotoModel: createPortfolioPhotoModel(),
        MediaObjectModel,
        mediaStore: createMediaStore({
          async stage() {
            throw new Error("storage offline secret_123");
          },
        }),
      }),
    /storage offline/
  );

  assert.equal(updateAttempts, 1);
  assert.deepEqual(logs, [
    [
      {
        event: "portfolio_media.stage_failure_persist_failed",
        operation: "markStageFailure",
        mediaObjectId: String(MediaObjectModel.docs[0]._id),
        photoId: undefined,
        status: MEDIA_OBJECT_STATES.FAILED,
        err: { name: "Error" },
      },
      "portfolio_media.stage_failure_persist_failed",
    ],
  ]);
  assert.doesNotMatch(JSON.stringify(logs), /secret_123|storage offline|\/srv\/private\/portfolio/i);
});

test("logger absence or throws do not mask portfolio persistence failures", async () => {
  const MediaObjectModel = createMediaObjectModel();
  MediaObjectModel.findByIdAndUpdate = async () => {
    throw new Error("write failed");
  };

  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => true);
  __portfolioMediaServiceTestHooks.setStartSession(async () => createSession());
  __portfolioMediaServiceTestHooks.setLogger(null);

  await assert.rejects(
    () =>
      createPortfolioPhotoWithMedia({
        payload: {
          _id: "64c000000000000000000121",
          beforeUrl: "/uploads/portfolio/a.jpg",
          afterUrl: "/uploads/portfolio/b.jpg",
        },
        filesByKind: {
          before: { filename: "a.jpg", originalname: "a.jpg", buffer: Buffer.from("a") },
          after: { filename: "b.jpg", originalname: "b.jpg", buffer: Buffer.from("b") },
        },
        PortfolioPhotoModel: createPortfolioPhotoModel(),
        MediaObjectModel,
        mediaStore: createMediaStore({
          async stage() {
            throw new Error("storage offline");
          },
        }),
      }),
    /storage offline/
  );

  __portfolioMediaServiceTestHooks.setLogger({
    warn() {
      throw new Error("logger unavailable");
    },
  });
  await assert.rejects(
    () =>
      createPortfolioPhotoWithMedia({
        payload: {
          _id: "64c000000000000000000122",
          beforeUrl: "/uploads/portfolio/c.jpg",
          afterUrl: "/uploads/portfolio/d.jpg",
        },
        filesByKind: {
          before: { filename: "c.jpg", originalname: "c.jpg", buffer: Buffer.from("c") },
          after: { filename: "d.jpg", originalname: "d.jpg", buffer: Buffer.from("d") },
        },
        PortfolioPhotoModel: createPortfolioPhotoModel(),
        MediaObjectModel: createMediaObjectModel(),
        mediaStore: createMediaStore({
          async stage() {
            throw new Error("storage offline");
          },
        }),
      }),
    /storage offline/
  );
});

test("logs sanitized warning when delete finalization metadata update fails", async () => {
  const logs = [];
  const PortfolioPhotoModel = createPortfolioPhotoModel();
  PortfolioPhotoModel.docs.push({
    _id: "64c000000000000000000123",
    active: true,
  });
  const MediaObjectModel = createMediaObjectModel();
  MediaObjectModel.docs.push({
    _id: "64c000000000000000000223",
    storageKey: "33333333-3333-4333-8333-333333333333.jpg",
    legacyUrl: "/uploads/portfolio/delete-fail-before.jpg",
    mediaClass: "portfolio-before",
    ownerModel: "PortfolioPhoto",
    ownerId: "64c000000000000000000123",
    status: MEDIA_OBJECT_STATES.ACTIVE,
  });

  let updateAttempts = 0;
  MediaObjectModel.findByIdAndUpdate = async (id, update) => {
    if (update?.$set?.failureCode === "PORTFOLIO_MEDIA_DELETE_PENDING") {
      updateAttempts += 1;
      throw new Error("write failed /srv/private/delete");
    }
    const doc = MediaObjectModel.docs.find((entry) => String(entry._id) === String(id));
    if (!doc) return null;
    Object.assign(doc, update.$set || {});
    return doc;
  };

  __portfolioMediaServiceTestHooks.setLogger({
    warn: (...args) => logs.push(args),
  });
  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => true);
  __portfolioMediaServiceTestHooks.setStartSession(async () => createSession());

  await deletePortfolioPhotoWithMedia({
    photo: {
      _id: "64c000000000000000000123",
      beforeUrl: "/uploads/portfolio/delete-fail-before.jpg",
      beforeMediaObjectId: "64c000000000000000000223",
    },
    PortfolioPhotoModel,
    MediaObjectModel,
    mediaStore: createMediaStore({
      async delete() {
        throw new Error("storage delete failed secret_123");
      },
    }),
  });

  assert.equal(updateAttempts, 1);
  assert.deepEqual(logs, [
    [
      {
        event: "portfolio_media.cleanup_finalize_persist_failed",
        operation: "finalizeDeletedMedia",
        mediaObjectId: "64c000000000000000000223",
        photoId: undefined,
        status: MEDIA_OBJECT_STATES.DELETE_PENDING,
        err: { name: "Error" },
      },
      "portfolio_media.cleanup_finalize_persist_failed",
    ],
  ]);
  assert.doesNotMatch(JSON.stringify(logs), /secret_123|storage delete failed|\/srv\/private\/delete/i);
  assert.equal(MediaObjectModel.docs[0].status, MEDIA_OBJECT_STATES.DELETE_PENDING);
});

test("logs sanitized warning when create rollback staged status update fails", async () => {
  const logs = [];
  const MediaObjectModel = createMediaObjectModel();
  let promoteAttempts = 0;
  const mediaStore = createMediaStore({
    async promote(args) {
      promoteAttempts += 1;
      if (promoteAttempts === 2) {
        throw new Error("promote failed secret_123");
      }
      return createMediaStore().promote.call(this, args);
    },
  });

  let updateAttempts = 0;
  const originalFindByIdAndUpdate = MediaObjectModel.findByIdAndUpdate.bind(MediaObjectModel);
  MediaObjectModel.findByIdAndUpdate = async (id, update) => {
    if (update?.$set?.failureCode === "PORTFOLIO_MEDIA_STAGED") {
      updateAttempts += 1;
      throw new Error("persist failed at /srv/private/staged");
    }
    return originalFindByIdAndUpdate(id, update);
  };

  __portfolioMediaServiceTestHooks.setLogger({
    warn: (...args) => logs.push(args),
  });
  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => true);
  __portfolioMediaServiceTestHooks.setStartSession(async () => createSession());

  await assert.rejects(
    () =>
      createPortfolioPhotoWithMedia({
        payload: {
          _id: "64c000000000000000000124",
          beforeUrl: "/uploads/portfolio/recover-before.jpg",
          afterUrl: "/uploads/portfolio/recover-after.jpg",
        },
        filesByKind: {
          before: {
            filename: "recover-before.jpg",
            originalname: "before.jpg",
            buffer: Buffer.from("before"),
          },
          after: {
            filename: "recover-after.jpg",
            originalname: "after.jpg",
            buffer: Buffer.from("after"),
          },
        },
        PortfolioPhotoModel: createPortfolioPhotoModel(),
        MediaObjectModel,
        mediaStore,
      }),
    /promote failed/
  );

  assert.equal(updateAttempts, 1);
  assert.deepEqual(logs, [
    [
      {
        event: "portfolio_media.compensation_status_persist_failed",
        operation: "createPortfolioPhotoWithMedia",
        mediaObjectId: undefined,
        photoId: "64c000000000000000000124",
        status: MEDIA_OBJECT_STATES.STAGED,
        err: { name: "Error" },
      },
      "portfolio_media.compensation_status_persist_failed",
    ],
  ]);
  assert.doesNotMatch(JSON.stringify(logs), /secret_123|promote failed|\/srv\/private\/staged/i);
  assert.equal(MediaObjectModel.docs[1].status, MEDIA_OBJECT_STATES.STAGED);
});

test("logs sanitized warning when delete-pending CAS write throws during create rollback", async () => {
  const logs = [];
  const PortfolioPhotoModel = createPortfolioPhotoModel();
  const MediaObjectModel = createMediaObjectModel();
  const mediaStore = createMediaStore();
  const originalFindOneAndUpdate = MediaObjectModel.findOneAndUpdate.bind(MediaObjectModel);
  let deletePendingAttempts = 0;
  let writeCount = 0;

  MediaObjectModel.findOneAndUpdate = async (query, update) => {
    writeCount += 1;
    if (writeCount === 1) throw new Error("binding write failed");
    if (
      update?.$set?.status === MEDIA_OBJECT_STATES.DELETE_PENDING &&
      deletePendingAttempts === 0
    ) {
      deletePendingAttempts += 1;
      throw new Error("delete pending write failed /srv/private/cas");
    }
    return originalFindOneAndUpdate(query, update);
  };

  __portfolioMediaServiceTestHooks.setLogger({
    warn: (...args) => logs.push(args),
  });
  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => true);
  __portfolioMediaServiceTestHooks.setStartSession(async () => createSession());

  await assert.rejects(
    () =>
      createPortfolioPhotoWithMedia({
        payload: {
          _id: "64c000000000000000000125",
          beforeUrl: "/uploads/portfolio/cas-before.jpg",
          afterUrl: "/uploads/portfolio/cas-after.jpg",
        },
        filesByKind: {
          before: {
            filename: "cas-before.jpg",
            originalname: "before.jpg",
            buffer: Buffer.from("before"),
          },
          after: {
            filename: "cas-after.jpg",
            originalname: "after.jpg",
            buffer: Buffer.from("after"),
          },
        },
        PortfolioPhotoModel,
        MediaObjectModel,
        mediaStore,
      }),
    /binding write failed/
  );

  assert.equal(deletePendingAttempts, 1);
  assert.deepEqual(logs, [
    [
      {
        event: "portfolio_media.delete_pending_persist_failed",
        operation: "markDeletePending",
        mediaObjectId: undefined,
        photoId: "64c000000000000000000125",
        status: MEDIA_OBJECT_STATES.DELETE_PENDING,
        err: { name: "Error" },
      },
      "portfolio_media.delete_pending_persist_failed",
    ],
  ]);
  assert.doesNotMatch(JSON.stringify(logs), /\/srv\/private\/cas|binding write failed/i);
  assert.equal(mediaStore.deleted.length, 1);
  assert.equal(MediaObjectModel.docs[0].status, MEDIA_OBJECT_STATES.STAGED);
});

test("hostile portfolio logger identifiers are neither coerced nor logged", async () => {
  const logs = [];
  const coercionCounters = {
    photoToString: 0,
    photoValueOf: 0,
    photoPrimitive: 0,
  };
  const hostilePhotoId = {
    toString() {
      coercionCounters.photoToString += 1;
      throw new Error("should not coerce photoId");
    },
    valueOf() {
      coercionCounters.photoValueOf += 1;
      return "64c000000000000000000778";
    },
    [Symbol.toPrimitive]() {
      coercionCounters.photoPrimitive += 1;
      return "../private/photo";
    },
  };

  const MediaObjectModel = createMediaObjectModel();
  let updateAttempts = 0;
  MediaObjectModel.findByIdAndUpdate = async (id, update) => {
    if (update?.$set?.failureCode === "PORTFOLIO_MEDIA_STAGED") {
      updateAttempts += 1;
      throw new Error("persist failed");
    }
    return null;
  };

  __portfolioMediaServiceTestHooks.setLogger({
    warn: (...args) => logs.push(args),
  });
  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => true);
  __portfolioMediaServiceTestHooks.setStartSession(async () => createSession());

  await assert.rejects(
    () =>
      createPortfolioPhotoWithMedia({
        MediaObjectModel,
        mediaStore: createMediaStore({
          async promote() {
            throw new Error("promote failed secret_123");
          },
        }),
        payload: {
          _id: hostilePhotoId,
          beforeUrl: "/uploads/portfolio/hostile-before.jpg",
          afterUrl: "/uploads/portfolio/hostile-after.jpg",
        },
        filesByKind: {
          before: {
            filename: "hostile-before.jpg",
            originalname: "before.jpg",
            buffer: Buffer.from("before"),
          },
          after: {
            filename: "hostile-after.jpg",
            originalname: "after.jpg",
            buffer: Buffer.from("after"),
          },
        },
        PortfolioPhotoModel: createPortfolioPhotoModel(),
      }),
    /promote failed/
  );

  assert.equal(updateAttempts, 2);
  assert.deepEqual(coercionCounters, {
    photoToString: 0,
    photoValueOf: 0,
    photoPrimitive: 0,
  });
  assert.equal(logs.length, 2);
  for (const entry of logs) {
    assert.deepEqual(entry, [
      {
        event: "portfolio_media.compensation_status_persist_failed",
        operation: "createPortfolioPhotoWithMedia",
        mediaObjectId: undefined,
        photoId: undefined,
        status: MEDIA_OBJECT_STATES.STAGED,
        err: { name: "Error" },
      },
      "portfolio_media.compensation_status_persist_failed",
    ]);
  }
  assert.doesNotMatch(JSON.stringify(logs), /secret_123|64c000000000000000000778|private\/photo/i);
});

test("open returns a stream only for the exact active photo binding", async () => {
  const MediaObjectModel = createMediaObjectModel();
  MediaObjectModel.docs.push({
    _id: "64c000000000000000000204",
    storageKey: "44444444-4444-4444-8444-444444444444.jpg",
    legacyUrl: "/uploads/portfolio/stream-before.jpg",
    mediaClass: "portfolio-before",
    ownerModel: "PortfolioPhoto",
    ownerId: "64c000000000000000000107",
    status: MEDIA_OBJECT_STATES.ACTIVE,
    contentType: "image/jpeg",
  });

  const media = await openPortfolioPhotoMedia({
    photo: {
      _id: "64c000000000000000000107",
      beforeUrl: "/uploads/portfolio/stream-before.jpg",
      beforeMediaObjectId: "64c000000000000000000204",
    },
    kind: "before",
    MediaObjectModel,
    mediaStore: createMediaStore(),
  });
  const missing = await openPortfolioPhotoMedia({
    photo: {
      _id: "64c000000000000000000108",
      beforeUrl: "/uploads/portfolio/stream-before.jpg",
      beforeMediaObjectId: "64c000000000000000000204",
    },
    kind: "before",
    MediaObjectModel,
    mediaStore: createMediaStore(),
  });

  assert.equal(media.stream, "stream:44444444-4444-4444-8444-444444444444.jpg");
  assert.equal(missing, null);
});
