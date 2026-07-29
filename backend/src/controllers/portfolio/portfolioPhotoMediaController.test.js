import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { PassThrough, Readable } from "node:stream";

import MediaObject from "../../models/MediaObject.js";
import PortfolioPhoto from "../../models/PortfolioPhoto.js";
import {
  serveOwnerPortfolioImage,
  servePublicPortfolioImage,
} from "./portfolioPhotoMediaController.js";
import { __portfolioMediaServiceTestHooks } from "../../services/portfolio/portfolioMediaService.js";

const portfolioPhotoId = "64c000000000000000000010";
const barberId = "64c000000000000000000001";

const originals = {
  portfolioFindById: PortfolioPhoto.findById,
  portfolioFindOne: PortfolioPhoto.findOne,
  mediaFindOne: MediaObject.findOne,
};

const createSendFileResponse = () => ({
  statusCode: 200,
  body: undefined,
  sentFile: "",
  headers: {},
  headersSent: false,
  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  },
  type(value) {
    this.headers["content-type"] = value;
    return this;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    this.headersSent = true;
    return this;
  },
  sendFile(filePath, callback) {
    this.sentFile = filePath;
    if (callback) callback(null);
    return this;
  },
});

const createStreamingResponse = () => {
  const stream = new PassThrough();
  stream.statusCode = 200;
  stream.body = undefined;
  stream.headers = {};
  stream.headersSent = false;
  stream.setHeader = (name, value) => {
    stream.headers[name.toLowerCase()] = value;
  };
  stream.type = (value) => {
    stream.headers["content-type"] = value;
    return stream;
  };
  stream.status = (code) => {
    stream.statusCode = code;
    return stream;
  };
  stream.json = (payload) => {
    stream.body = payload;
    stream.headersSent = true;
    return stream;
  };
  stream.sendFile = () => stream;
  return stream;
};

afterEach(() => {
  PortfolioPhoto.findById = originals.portfolioFindById;
  PortfolioPhoto.findOne = originals.portfolioFindOne;
  MediaObject.findOne = originals.mediaFindOne;
  __portfolioMediaServiceTestHooks.resetMediaStore();
});

test("GET /uploads/portfolio/:filename streams active public bound media", async () => {
  PortfolioPhoto.findOne = () => ({
    select() {
      return {
        lean: async () => ({
          _id: portfolioPhotoId,
          beforeUrl: "/uploads/portfolio/public-before.jpg",
          beforeMediaObjectId: "64c000000000000000000201",
          active: true,
          isPublic: true,
          consentConfirmed: true,
        }),
      };
    },
  });
  MediaObject.findOne = () => ({
    async lean() {
      return {
        _id: "64c000000000000000000201",
        storageKey: "11111111-1111-4111-8111-111111111111.jpg",
        ownerModel: "PortfolioPhoto",
        ownerId: portfolioPhotoId,
        mediaClass: "portfolio-before",
        legacyUrl: "/uploads/portfolio/public-before.jpg",
        status: "active",
        contentType: "image/jpeg",
      };
    },
  });
  __portfolioMediaServiceTestHooks.setMediaStore({
    async createReadStream() {
      return Readable.from(["before-bytes"]);
    },
  });

  const res = createStreamingResponse();
  const chunks = [];
  res.on("data", (chunk) => chunks.push(chunk));
  await servePublicPortfolioImage({ params: { filename: "public-before.jpg" } }, res);

  assert.equal(Buffer.concat(chunks).toString(), "before-bytes");
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.headers["content-type"], "image/jpeg");
});

test("GET /uploads/portfolio/:filename serves genuine legacy rows from disk", async () => {
  PortfolioPhoto.findOne = () => ({
    select() {
      return {
        lean: async () => ({
          _id: portfolioPhotoId,
          beforeUrl: "/uploads/portfolio/legacy-before.jpg",
          beforeMediaObjectId: null,
          active: true,
          isPublic: true,
          consentConfirmed: true,
        }),
      };
    },
  });

  const res = createSendFileResponse();
  await servePublicPortfolioImage(
    { params: { filename: "legacy-before.jpg" } },
    res
  );

  assert.ok(res.sentFile.endsWith("uploads/portfolio/legacy-before.jpg"));
  assert.equal(res.headers["cache-control"], "no-store");
});

test("GET /uploads/portfolio/:filename rejects mixed legacy/media rows for the unbound kind", async () => {
  PortfolioPhoto.findOne = () => ({
    select() {
      return {
        lean: async () => ({
          _id: portfolioPhotoId,
          afterUrl: "/uploads/portfolio/mixed-after.jpg",
          beforeMediaObjectId: "64c000000000000000000220",
          afterMediaObjectId: null,
          active: true,
          isPublic: true,
          consentConfirmed: true,
        }),
      };
    },
  });

  const res = createSendFileResponse();
  await servePublicPortfolioImage(
    { params: { filename: "mixed-after.jpg" } },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.sentFile, "");
});

test("GET /uploads/portfolio/:filename fails closed for revoked or mismatched bound media", async () => {
  PortfolioPhoto.findOne = () => ({
    select() {
      return {
        lean: async () => ({
          _id: portfolioPhotoId,
          beforeUrl: "/uploads/portfolio/revoked-before.jpg",
          beforeMediaObjectId: "64c000000000000000000202",
          active: true,
          isPublic: true,
          consentConfirmed: true,
        }),
      };
    },
  });
  MediaObject.findOne = () => ({
    async lean() {
      return null;
    },
  });
  __portfolioMediaServiceTestHooks.setMediaStore({
    async createReadStream() {
      throw new Error("should not stream");
    },
  });

  const res = createSendFileResponse();
  await servePublicPortfolioImage(
    { params: { filename: "revoked-before.jpg" } },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.sentFile, "");
});

test("GET /api/portfolio/:id/images/:kind denies unrelated barbers", async () => {
  PortfolioPhoto.findById = () => ({
    select: async () => ({
      _id: portfolioPhotoId,
      barberId,
      beforeUrl: "/uploads/portfolio/private-before.jpg",
      beforeMediaObjectId: "64c000000000000000000203",
      active: true,
    }),
  });

  const res = createSendFileResponse();
  await serveOwnerPortfolioImage(
    {
      user: { _id: "64c000000000000000000999", role: "barber" },
      params: { id: portfolioPhotoId, kind: "before" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("GET /api/portfolio/:id/images/:kind streams exact owner binding", async () => {
  PortfolioPhoto.findById = () => ({
    select: async () => ({
      _id: portfolioPhotoId,
      barberId,
      beforeUrl: "/uploads/portfolio/private-before.jpg",
      beforeMediaObjectId: "64c000000000000000000204",
      active: true,
    }),
  });
  MediaObject.findOne = () => ({
    async lean() {
      return {
        _id: "64c000000000000000000204",
        storageKey: "22222222-2222-4222-8222-222222222222.jpg",
        ownerModel: "PortfolioPhoto",
        ownerId: portfolioPhotoId,
        mediaClass: "portfolio-before",
        legacyUrl: "/uploads/portfolio/private-before.jpg",
        status: "active",
        contentType: "image/jpeg",
      };
    },
  });
  __portfolioMediaServiceTestHooks.setMediaStore({
    async createReadStream() {
      return Readable.from(["owner-bytes"]);
    },
  });

  const res = createStreamingResponse();
  const chunks = [];
  res.on("data", (chunk) => chunks.push(chunk));
  await serveOwnerPortfolioImage(
    {
      user: { _id: barberId, role: "barber" },
      params: { id: portfolioPhotoId, kind: "before" },
    },
    res
  );

  assert.equal(Buffer.concat(chunks).toString(), "owner-bytes");
  assert.equal(res.headers["cache-control"], "no-store");
});

test("GET /api/portfolio/:id/images/:kind serves genuine legacy owner rows from disk", async () => {
  PortfolioPhoto.findById = () => ({
    select: async () => ({
      _id: portfolioPhotoId,
      barberId,
      afterUrl: "/uploads/portfolio/private-legacy-after.jpg",
      afterMediaObjectId: null,
      active: true,
    }),
  });

  const res = createSendFileResponse();
  await serveOwnerPortfolioImage(
    {
      user: { _id: barberId, role: "barber" },
      params: { id: portfolioPhotoId, kind: "after" },
    },
    res
  );

  assert.ok(res.sentFile.endsWith("uploads/portfolio/private-legacy-after.jpg"));
});

test("GET /api/portfolio/:id/images/:kind rejects mixed owner rows for the unbound kind", async () => {
  PortfolioPhoto.findById = () => ({
    select: async () => ({
      _id: portfolioPhotoId,
      barberId,
      afterUrl: "/uploads/portfolio/private-mixed-after.jpg",
      beforeMediaObjectId: "64c000000000000000000221",
      afterMediaObjectId: null,
      active: true,
    }),
  });

  const res = createSendFileResponse();
  await serveOwnerPortfolioImage(
    {
      user: { _id: barberId, role: "barber" },
      params: { id: portfolioPhotoId, kind: "after" },
    },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.sentFile, "");
});
