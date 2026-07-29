import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { afterEach, test } from "node:test";

import {
  addPortfolioPhoto,
  deletePortfolioPhoto,
  getMyPortfolio,
  getPortfolioByBarber,
  updatePortfolioPhoto,
} from "./portfolioPhotoController.js";
import MediaObject from "../../models/MediaObject.js";
import PortfolioPhoto from "../../models/PortfolioPhoto.js";
import Service from "../../models/Service.js";
import { __portfolioMediaServiceTestHooks } from "../../services/portfolio/portfolioMediaService.js";

const barberId = "64c000000000000000000001";
const otherBarberId = "64c000000000000000000002";
const portfolioPhotoId = "64c000000000000000000010";
const uploadsDir = path.resolve(process.cwd(), "uploads", "portfolio");

const originals = {
  portfolioFind: PortfolioPhoto.find,
  portfolioFindById: PortfolioPhoto.findById,
  portfolioFindOne: PortfolioPhoto.findOne,
  portfolioFindOneAndUpdate: PortfolioPhoto.findOneAndUpdate,
  mediaCreate: MediaObject.create,
  mediaFindByIdAndUpdate: MediaObject.findByIdAndUpdate,
  mediaFindOneAndUpdate: MediaObject.findOneAndUpdate,
  mediaFindOne: MediaObject.findOne,
  serviceFindById: Service.findById,
};

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

const createFindChain = (result) => ({
  select() {
    return createFindChain(result);
  },
  sort() {
    return createFindChain(result);
  },
  lean: async () => result,
});

const createPortfolioDoc = (overrides = {}) => ({
  _id: portfolioPhotoId,
  barberId,
  beforeUrl: "/uploads/portfolio/before.jpg",
  afterUrl: "/uploads/portfolio/after.jpg",
  isPublic: true,
  consentConfirmed: true,
  active: true,
  category: "",
  caption: "",
  tags: [],
  sortOrder: 0,
  serviceId: null,
  salonId: null,
  ...overrides,
  toObject() {
    const { toObject, save, ...rest } = this;
    return { ...rest };
  },
  async save() {
    return this;
  },
});

const createMongoLabelError = (message, labels) => {
  const error = new Error(message);
  error.errorLabels = labels;
  error.hasErrorLabel = (label) => labels.includes(label);
  return error;
};

const createMediaObjectModel = () => {
  const docs = [];
  MediaObject.create = async (payload) => {
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
  };
  MediaObject.findByIdAndUpdate = async (id, update) => {
    const doc = docs.find((entry) => String(entry._id) === String(id));
    if (!doc) return null;
    Object.assign(doc, update.$set || {});
    return doc;
  };
  MediaObject.findOneAndUpdate = async (query, update) => {
    const doc = docs.find((entry) =>
      Object.entries(query).every(([key, value]) => String(entry[key]) === String(value))
    );
    if (!doc) return null;
    Object.assign(doc, update.$set || {});
    return doc;
  };
  MediaObject.findOne = (query) => ({
    async lean() {
      return (
        docs.find((entry) =>
          Object.entries(query).every(([key, value]) => String(entry[key]) === String(value))
        ) || null
      );
    },
  });
  return docs;
};

afterEach(() => {
  PortfolioPhoto.find = originals.portfolioFind;
  PortfolioPhoto.findById = originals.portfolioFindById;
  PortfolioPhoto.findOne = originals.portfolioFindOne;
  PortfolioPhoto.findOneAndUpdate = originals.portfolioFindOneAndUpdate;
  MediaObject.create = originals.mediaCreate;
  MediaObject.findByIdAndUpdate = originals.mediaFindByIdAndUpdate;
  MediaObject.findOneAndUpdate = originals.mediaFindOneAndUpdate;
  MediaObject.findOne = originals.mediaFindOne;
  Service.findById = originals.serviceFindById;
  __portfolioMediaServiceTestHooks.resetMediaStore();
  __portfolioMediaServiceTestHooks.resetSupportsTransactions();
  __portfolioMediaServiceTestHooks.resetStartSession();
});

test("GET /api/portfolio/barber/:barberId returns public photos", async () => {
  PortfolioPhoto.find = () =>
    createFindChain([createPortfolioDoc({ _id: "64c000000000000000000011" })]);

  const res = createResponse();
  await getPortfolioByBarber({ params: { barberId } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].id, "64c000000000000000000011");
});

test("GET /api/portfolio/me requires barber role", async () => {
  const res = createResponse();
  await getMyPortfolio({ user: { role: "client" } }, res);
  assert.equal(res.statusCode, 403);
});

test("POST /api/portfolio requires both images", async () => {
  const res = createResponse();
  await addPortfolioPhoto(
    {
      user: { _id: barberId, role: "barber" },
      files: { beforeImage: [{ filename: "before.jpg" }] },
      body: {},
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Both beforeImage and afterImage files are required");
});

test("POST /api/portfolio preserves URLs, hides internal bindings, and uses the media saga", async () => {
  const mediaDocs = createMediaObjectModel();
  PortfolioPhoto.findOne = () => createFindChain(null);
  PortfolioPhoto.findOneAndUpdate = async (_query, update) => createPortfolioDoc(update.$setOnInsert);
  Service.findById = () => ({
    select() {
      return { lean: async () => ({ barberId, active: true }) };
    },
  });

  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => true);
  __portfolioMediaServiceTestHooks.setStartSession(async () => ({
    async withTransaction(callback) {
      await callback();
    },
    async endSession() {},
  }));
  __portfolioMediaServiceTestHooks.setMediaStore({
    provider: "local",
    async stage({ storageKey, stageKey }) {
      return { provider: "local", storageKey, stageKey, bytes: 10 };
    },
    async promote() {
      return { provider: "local", promoted: true };
    },
    async delete() {
      return { deleted: true };
    },
    async createReadStream() {
      return "unused";
    },
  });

  const res = createResponse();
  await addPortfolioPhoto(
    {
      user: { _id: barberId, role: "barber" },
      files: {
        beforeImage: [
          {
            filename: "portfolio-before.jpg",
            originalname: "before.jpg",
            mimetype: "image/jpeg",
            buffer: Buffer.from("before"),
          },
        ],
        afterImage: [
          {
            filename: "portfolio-after.jpg",
            originalname: "after.jpg",
            mimetype: "image/jpeg",
            buffer: Buffer.from("after"),
          },
        ],
      },
      body: { consentConfirmed: true, serviceId: "64c000000000000000000020" },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.beforeUrl, "/uploads/portfolio/portfolio-before.jpg");
  assert.equal(res.body.afterUrl, "/uploads/portfolio/portfolio-after.jpg");
  assert.equal("beforeMediaObjectId" in res.body, false);
  assert.equal("afterMediaObjectId" in res.body, false);
  assert.equal(mediaDocs.length, 2);
});

test("POST /api/portfolio fails closed with 503 and cleans uploaded files when transactions are unsupported", async () => {
  const beforePath = path.join(uploadsDir, "unsupported-before.jpg");
  const afterPath = path.join(uploadsDir, "unsupported-after.jpg");
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(beforePath, "before");
  fs.writeFileSync(afterPath, "after");

  PortfolioPhoto.findOne = () => createFindChain(null);
  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => false);

  const res = createResponse();
  await addPortfolioPhoto(
    {
      user: { _id: barberId, role: "barber" },
      files: {
        beforeImage: [{ filename: "unsupported-before.jpg", path: beforePath }],
        afterImage: [{ filename: "unsupported-after.jpg", path: afterPath }],
      },
      body: { consentConfirmed: true },
    },
    res
  );

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.message, "Portfolio media requires transaction support");
  assert.equal(fs.existsSync(beforePath), false);
  assert.equal(fs.existsSync(afterPath), false);
});

test("POST /api/portfolio returns 503 for unresolved unknown commit results without compensating media", async () => {
  const mediaDocs = createMediaObjectModel();
  const mediaStore = {
    provider: "local",
    deleted: [],
    async stage({ storageKey, stageKey }) {
      return { provider: "local", storageKey, stageKey, bytes: 10 };
    },
    async promote() {
      return { provider: "local", promoted: true };
    },
    async delete(storageKey) {
      this.deleted.push(storageKey);
      return { deleted: true };
    },
    async createReadStream() {
      return "unused";
    },
  };

  PortfolioPhoto.findOne = (query) => {
    if (query?.barberId && !("beforeMediaObjectId" in query)) {
      return createFindChain(null);
    }
    return {
      select() {
        return {
          async lean() {
            return null;
          },
        };
      },
    };
  };
  PortfolioPhoto.findOneAndUpdate = async (_query, update) => createPortfolioDoc(update.$setOnInsert);

  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => true);
  __portfolioMediaServiceTestHooks.setStartSession(async () => ({
    async withTransaction(callback) {
      await callback();
      throw createMongoLabelError("commit unknown", ["UnknownTransactionCommitResult"]);
    },
    async endSession() {},
  }));
  __portfolioMediaServiceTestHooks.setMediaStore(mediaStore);

  const res = createResponse();
  await addPortfolioPhoto(
    {
      user: { _id: barberId, role: "barber" },
      files: {
        beforeImage: [
          {
            filename: "ambiguous-before.jpg",
            originalname: "before.jpg",
            mimetype: "image/jpeg",
            buffer: Buffer.from("before"),
          },
        ],
        afterImage: [
          {
            filename: "ambiguous-after.jpg",
            originalname: "after.jpg",
            mimetype: "image/jpeg",
            buffer: Buffer.from("after"),
          },
        ],
      },
      body: { consentConfirmed: true },
    },
    res
  );

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.message, "Portfolio media commit outcome is unknown; retry later");
  assert.equal(mediaStore.deleted.length, 0);
  assert.equal(mediaDocs.filter((doc) => doc.status === "delete-pending").length, 0);
});

test("POST /api/portfolio returns 503 when ambiguous commit reconciliation hits I/O failure", async () => {
  const mediaDocs = createMediaObjectModel();
  const mediaStore = {
    provider: "local",
    deleted: [],
    async stage({ storageKey, stageKey }) {
      return { provider: "local", storageKey, stageKey, bytes: 10 };
    },
    async promote() {
      return { provider: "local", promoted: true };
    },
    async delete(storageKey) {
      this.deleted.push(storageKey);
      return { deleted: true };
    },
    async createReadStream() {
      return "unused";
    },
  };

  PortfolioPhoto.findOne = (query) => {
    if (query?.barberId && !("beforeMediaObjectId" in query)) {
      return createFindChain(null);
    }
    return {
      select() {
        return {
          async lean() {
            throw new Error("reconcile read failed at /srv/private/media");
          },
        };
      },
    };
  };
  PortfolioPhoto.findOneAndUpdate = async (_query, update) => createPortfolioDoc(update.$setOnInsert);

  __portfolioMediaServiceTestHooks.setSupportsTransactions(() => true);
  __portfolioMediaServiceTestHooks.setStartSession(async () => ({
    async withTransaction(callback) {
      await callback();
      throw createMongoLabelError("commit unknown", ["UnknownTransactionCommitResult"]);
    },
    async endSession() {},
  }));
  __portfolioMediaServiceTestHooks.setMediaStore(mediaStore);

  const res = createResponse();
  await addPortfolioPhoto(
    {
      user: { _id: barberId, role: "barber" },
      files: {
        beforeImage: [
          {
            filename: "reconcile-before.jpg",
            originalname: "before.jpg",
            mimetype: "image/jpeg",
            buffer: Buffer.from("before"),
          },
        ],
        afterImage: [
          {
            filename: "reconcile-after.jpg",
            originalname: "after.jpg",
            mimetype: "image/jpeg",
            buffer: Buffer.from("after"),
          },
        ],
      },
      body: { consentConfirmed: true },
    },
    res
  );

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.message, "Portfolio media commit outcome is unknown; retry later");
  assert.equal(mediaStore.deleted.length, 0);
  assert.equal(mediaDocs.filter((doc) => doc.status === "delete-pending").length, 0);
});

test("PUT /api/portfolio/:id remains metadata-only", async () => {
  const photo = createPortfolioDoc({
    save: async function save() {
      return this;
    },
  });
  PortfolioPhoto.findById = async () => photo;

  const res = createResponse();
  await updatePortfolioPhoto(
    {
      user: { _id: barberId, role: "barber" },
      params: { id: portfolioPhotoId },
      body: { caption: "Updated", isPublic: false, consentConfirmed: false },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(photo.caption, "Updated");
  assert.equal(photo.beforeUrl, "/uploads/portfolio/before.jpg");
  assert.equal(photo.isPublic, false);
});

test("DELETE /api/portfolio/:id preserves legacy soft-delete behavior when no media bindings exist", async () => {
  const photo = createPortfolioDoc({
    beforeMediaObjectId: null,
    afterMediaObjectId: null,
    async save() {
      return this;
    },
  });
  PortfolioPhoto.findById = () => ({
    select: async () => photo,
  });

  const res = createResponse();
  await deletePortfolioPhoto(
    {
      user: { _id: barberId, role: "barber" },
      params: { id: portfolioPhotoId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(photo.active, false);
  assert.equal(res.body.message, "Portfolio photo deleted");
});

test("DELETE /api/portfolio/:id rejects non-owner access", async () => {
  PortfolioPhoto.findById = () => ({
    select: async () => createPortfolioDoc(),
  });

  const res = createResponse();
  await deletePortfolioPhoto(
    {
      user: { _id: otherBarberId, role: "barber" },
      params: { id: portfolioPhotoId },
    },
    res
  );

  assert.equal(res.statusCode, 403);
});
