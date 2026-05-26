import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  getPortfolioByBarber,
  getMyPortfolio,
  addPortfolioPhoto,
  updatePortfolioPhoto,
  deletePortfolioPhoto,
} from "./portfolioPhotoController.js";
import PortfolioPhoto from "../models/PortfolioPhoto.js";
import Service from "../models/Service.js";
import { deleteUploadedFile } from "../middleware/uploadMiddleware.js";

/* ── Test data ─────────────────────────────────────── */

const barberId = "000000000000000000000001";
const otherBarberId = "000000000000000000000002";
const clientId = "000000000000000000000003";
const salonId = "000000000000000000000004";
const serviceId = "000000000000000000000005";
const otherServiceId = "000000000000000000000006";
const portfolioPhotoId = "000000000000000000000010";
const nonexistentId = "000000000000000000000099";

const barber = { _id: barberId, role: "barber" };
const otherBarber = { _id: otherBarberId, role: "barber" };
const client = { _id: clientId, role: "client" };

const createPortfolioFixture = (overrides = {}) => ({
  _id: portfolioPhotoId,
  barberId,
  salonId: null,
  serviceId: null,
  category: "",
  beforeUrl: "/uploads/portfolio/before-test.jpg",
  afterUrl: "/uploads/portfolio/after-test.jpg",
  caption: "",
  tags: [],
  sortOrder: 0,
  isPublic: true,
  consentConfirmed: true,
  active: true,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
  ...overrides,
  toObject() {
    const { toObject, ...rest } = this;
    return { ...rest };
  },
});

const createServiceFixture = (overrides = {}) => ({
  _id: serviceId,
  barberId,
  name: "Test Service",
  active: true,
  ...overrides,
});

/* ── Helpers ────────────────────────────────────────── */

const originalMethods = {
  portfolioCreate: PortfolioPhoto.create,
  portfolioFind: PortfolioPhoto.find,
  portfolioFindById: PortfolioPhoto.findById,
  portfolioFindOne: PortfolioPhoto.findOne,
  serviceFindById: Service.findById,
};

afterEach(() => {
  PortfolioPhoto.create = originalMethods.portfolioCreate;
  PortfolioPhoto.find = originalMethods.portfolioFind;
  PortfolioPhoto.findById = originalMethods.portfolioFindById;
  PortfolioPhoto.findOne = originalMethods.portfolioFindOne;
  Service.findById = originalMethods.serviceFindById;
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

const createFindChain = (result) => ({
  select: () => createFindChain(result),
  populate: () => createFindChain(result),
  sort: () => createFindChain(result),
  lean: async () => result,
  then: (resolve) => Promise.resolve(result).then(resolve),
});

/* ── Tests ──────────────────────────────────────────── */

/* ── Public GET ── */

test("GET /api/portfolio/barber/:barberId returns only active + public + consented photos", async () => {
  const publicPhoto = createPortfolioFixture({ _id: "000000000000000000000011" });
  const inactivePhoto = createPortfolioFixture({ _id: "000000000000000000000012", active: false });
  const nonPublicPhoto = createPortfolioFixture({ _id: "000000000000000000000013", isPublic: false });
  const noConsentPhoto = createPortfolioFixture({ _id: "000000000000000000000014", consentConfirmed: false });

  PortfolioPhoto.find = () =>
    createFindChain([publicPhoto]); // should only return the one that matches

  const res = createResponse();
  await getPortfolioByBarber({ params: { barberId } }, res);

  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body));
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0]._id, "000000000000000000000011");
});

test("GET /api/portfolio/barber/:barberId returns empty array when no public photos", async () => {
  PortfolioPhoto.find = () => createFindChain([]);

  const res = createResponse();
  await getPortfolioByBarber({ params: { barberId } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
});

test("GET /api/portfolio/barber/:barberId requires barberId param", async () => {
  PortfolioPhoto.find = () => {
    throw new Error("should not be called");
  };

  const res = createResponse();
  await getPortfolioByBarber({ params: {} }, res);

  assert.equal(res.statusCode, 400);
});

/* ── Protected GET /me ── */

test("GET /api/portfolio/me requires barber role", async () => {
  PortfolioPhoto.find = () => {
    throw new Error("should not be called");
  };

  const res = createResponse();
  await getMyPortfolio({ user: client }, res);

  assert.equal(res.statusCode, 403);
});

test("GET /api/portfolio/me returns all portfolio photos for the barber", async () => {
  const photos = [
    createPortfolioFixture({ _id: "000000000000000000000015", active: true }),
    createPortfolioFixture({ _id: "000000000000000000000016", active: false }),
  ];

  PortfolioPhoto.find = () => createFindChain(photos);

  const res = createResponse();
  await getMyPortfolio({ user: barber }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 2);
});

/* ── POST create ── */

test("POST /api/portfolio requires barber role", async () => {
  PortfolioPhoto.create = async () => {
    throw new Error("should not be called");
  };

  const res = createResponse();
  await addPortfolioPhoto(
    { user: client, files: {}, body: {} },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("POST /api/portfolio rejects missing beforeImage", async () => {
  PortfolioPhoto.create = async () => {
    throw new Error("should not be called");
  };

  const res = createResponse();
  await addPortfolioPhoto(
    {
      user: barber,
      files: { afterImage: [{ path: "/tmp/after.jpg", filename: "after.jpg" }] },
      body: {},
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Both beforeImage and afterImage files are required");
});

test("POST /api/portfolio rejects missing afterImage", async () => {
  PortfolioPhoto.create = async () => {
    throw new Error("should not be called");
  };

  const res = createResponse();
  await addPortfolioPhoto(
    {
      user: barber,
      files: { beforeImage: [{ path: "/tmp/before.jpg", filename: "before.jpg" }] },
      body: {},
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Both beforeImage and afterImage files are required");
});

test("POST /api/portfolio rejects public photo without consentConfirmed true", async () => {
  PortfolioPhoto.create = async () => {
    throw new Error("should not be called");
  };

  const res = createResponse();
  await addPortfolioPhoto(
    {
      user: barber,
      files: {
        beforeImage: [{ path: "/tmp/before.jpg", filename: "before.jpg" }],
        afterImage: [{ path: "/tmp/after.jpg", filename: "after.jpg" }],
      },
      body: { isPublic: true, consentConfirmed: false },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(
    res.body.message,
    "consentConfirmed must be true when isPublic is true"
  );
});

test("POST /api/portfolio ignores client-provided barberId and uses req.user._id", async () => {
  let createdPayload;
  PortfolioPhoto.create = async (payload) => {
    createdPayload = payload;
    return createPortfolioFixture({ ...payload, _id: portfolioPhotoId });
  };
  PortfolioPhoto.findOne = () => createFindChain(null); // no last photo for sortOrder

  const res = createResponse();
  await addPortfolioPhoto(
    {
      user: barber,
      files: {
        beforeImage: [{ path: "/tmp/before.jpg", filename: "before-test.jpg" }],
        afterImage: [{ path: "/tmp/after.jpg", filename: "after-test.jpg" }],
      },
      body: {
        barberId: otherBarberId, // client-provided — should be ignored
        consentConfirmed: true,
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.barberId, barberId); // should use req.user._id, not body
});

test("POST /api/portfolio saves correct beforeUrl and afterUrl", async () => {
  let createdPayload;
  PortfolioPhoto.create = async (payload) => {
    createdPayload = payload;
    return createPortfolioFixture({ ...payload, _id: portfolioPhotoId });
  };
  PortfolioPhoto.findOne = () => createFindChain(null);

  const res = createResponse();
  await addPortfolioPhoto(
    {
      user: barber,
      files: {
        beforeImage: [{ path: "/tmp/before.jpg", filename: "photo-before.jpg" }],
        afterImage: [{ path: "/tmp/after.jpg", filename: "photo-after.jpg" }],
      },
      body: { consentConfirmed: true },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.beforeUrl, "/uploads/portfolio/photo-before.jpg");
  assert.equal(createdPayload.afterUrl, "/uploads/portfolio/photo-after.jpg");
});

test("POST /api/portfolio accepts non-public photo without consent (consentConfirmed false, isPublic false)", async () => {
  let createdPayload;
  PortfolioPhoto.create = async (payload) => {
    createdPayload = payload;
    return createPortfolioFixture({ ...payload, _id: portfolioPhotoId });
  };
  PortfolioPhoto.findOne = () => createFindChain(null);

  const res = createResponse();
  await addPortfolioPhoto(
    {
      user: barber,
      files: {
        beforeImage: [{ path: "/tmp/before.jpg", filename: "before.jpg" }],
        afterImage: [{ path: "/tmp/after.jpg", filename: "after.jpg" }],
      },
      body: { isPublic: false, consentConfirmed: false },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.isPublic, false);
  assert.equal(createdPayload.consentConfirmed, false);
});

test("POST /api/portfolio allows consentConfirmed: true without explicit isPublic (defaults to public)", async () => {
  let createdPayload;
  PortfolioPhoto.create = async (payload) => {
    createdPayload = payload;
    return createPortfolioFixture({ ...payload, _id: portfolioPhotoId });
  };
  PortfolioPhoto.findOne = () => createFindChain(null);

  const res = createResponse();
  await addPortfolioPhoto(
    {
      user: barber,
      files: {
        beforeImage: [{ path: "/tmp/before.jpg", filename: "before.jpg" }],
        afterImage: [{ path: "/tmp/after.jpg", filename: "after.jpg" }],
      },
      body: { consentConfirmed: true }, // isPublic defaults true
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.isPublic, true);
  assert.equal(createdPayload.consentConfirmed, true);
});

test("POST /api/portfolio cleans uploaded files on validation failure — returns 400", async () => {
  PortfolioPhoto.create = async () => {
    throw new Error("should not be called");
  };

  const req = {
    user: barber,
    files: {
      beforeImage: [{ path: "/tmp/before-fail.jpg", filename: "before-fail.jpg" }],
      afterImage: [{ path: "/tmp/after-fail.jpg", filename: "after-fail.jpg" }],
    },
    body: { isPublic: true, consentConfirmed: false }, // will trigger 400
  };

  const res = createResponse();
  await addPortfolioPhoto(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("consentConfirmed"));
});

const createServiceFindById = (result) => ({
  select: () => ({
    lean: async () => result,
  }),
});

test("POST /api/portfolio validates serviceId ownership — rejects other barber's service", async () => {
  PortfolioPhoto.create = async () => {
    throw new Error("should not be called");
  };
  PortfolioPhoto.findOne = () => createFindChain(null);

  Service.findById = () =>
    createServiceFindById(createServiceFixture({ barberId: otherBarberId, _id: otherServiceId }));

  const res = createResponse();
  await addPortfolioPhoto(
    {
      user: barber,
      files: {
        beforeImage: [{ path: "/tmp/before.jpg", filename: "before.jpg" }],
        afterImage: [{ path: "/tmp/after.jpg", filename: "after.jpg" }],
      },
      body: {
        serviceId: otherServiceId,
        consentConfirmed: true,
      },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "Service does not belong to this barber");
});

test("POST /api/portfolio validates serviceId ownership — rejects inactive service", async () => {
  PortfolioPhoto.create = async () => {
    throw new Error("should not be called");
  };
  PortfolioPhoto.findOne = () => createFindChain(null);

  Service.findById = () =>
    createServiceFindById(createServiceFixture({ _id: serviceId, barberId, active: false }));

  const res = createResponse();
  await addPortfolioPhoto(
    {
      user: barber,
      files: {
        beforeImage: [{ path: "/tmp/before.jpg", filename: "before.jpg" }],
        afterImage: [{ path: "/tmp/after.jpg", filename: "after.jpg" }],
      },
      body: {
        serviceId,
        consentConfirmed: true,
      },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "Service is not active");
});

test("POST /api/portfolio accepts valid own active serviceId", async () => {
  let createdPayload;
  PortfolioPhoto.create = async (payload) => {
    createdPayload = payload;
    return createPortfolioFixture({ ...payload, _id: portfolioPhotoId });
  };
  PortfolioPhoto.findOne = () => createFindChain(null);

  Service.findById = () =>
    createServiceFindById(createServiceFixture({ _id: serviceId, barberId, active: true }));

  const res = createResponse();
  await addPortfolioPhoto(
    {
      user: barber,
      files: {
        beforeImage: [{ path: "/tmp/before.jpg", filename: "before.jpg" }],
        afterImage: [{ path: "/tmp/after.jpg", filename: "after.jpg" }],
      },
      body: {
        serviceId,
        caption: "Great haircut!",
        tags: "haircut, style, trim",
        consentConfirmed: true,
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.serviceId, serviceId);
  assert.equal(createdPayload.caption, "Great haircut!");
});

test("POST /api/portfolio auto-assigns sortOrder 0 when no previous photos exist", async () => {
  let createdPayload;
  PortfolioPhoto.findOne = () => createFindChain(null); // no last photo
  PortfolioPhoto.create = async (payload) => {
    createdPayload = payload;
    return createPortfolioFixture({ ...payload, _id: portfolioPhotoId });
  };

  const res = createResponse();
  await addPortfolioPhoto(
    {
      user: barber,
      files: {
        beforeImage: [{ path: "/tmp/before.jpg", filename: "before.jpg" }],
        afterImage: [{ path: "/tmp/after.jpg", filename: "after.jpg" }],
      },
      body: { consentConfirmed: true },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.sortOrder, 0);
});

test("POST /api/portfolio increments sortOrder from last photo", async () => {
  let createdPayload;
  PortfolioPhoto.findOne = () => createFindChain({ sortOrder: 5 });
  PortfolioPhoto.create = async (payload) => {
    createdPayload = payload;
    return createPortfolioFixture({ ...payload, _id: portfolioPhotoId });
  };

  const res = createResponse();
  await addPortfolioPhoto(
    {
      user: barber,
      files: {
        beforeImage: [{ path: "/tmp/before.jpg", filename: "before.jpg" }],
        afterImage: [{ path: "/tmp/after.jpg", filename: "after.jpg" }],
      },
      body: { consentConfirmed: true },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.sortOrder, 6);
});

/* ── ObjectId validation (general) ── */

const malformedId = "not-a-valid-objectid";
const badSalonId = "definitely-not-valid";

test("POST /api/portfolio rejects malformed serviceId and cleans up files", async () => {
  PortfolioPhoto.findOne = () => createFindChain(null);

  const req = {
    user: barber,
    files: {
      beforeImage: [{ path: "/tmp/before.jpg", filename: "before-fail.jpg" }],
      afterImage: [{ path: "/tmp/after.jpg", filename: "after-fail.jpg" }],
    },
    body: { serviceId: malformedId, consentConfirmed: true },
  };

  const res = createResponse();
  PortfolioPhoto.create = async () => {
    throw new Error("should not be called");
  };

  await addPortfolioPhoto(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid serviceId");
});

test("POST /api/portfolio rejects malformed salonId and cleans up files", async () => {
  PortfolioPhoto.findOne = () => createFindChain(null);

  const req = {
    user: barber,
    files: {
      beforeImage: [{ path: "/tmp/before.jpg", filename: "before-fail.jpg" }],
      afterImage: [{ path: "/tmp/after.jpg", filename: "after-fail.jpg" }],
    },
    body: { salonId: badSalonId, consentConfirmed: true },
  };

  const res = createResponse();
  PortfolioPhoto.create = async () => {
    throw new Error("DB create should not be called");
  };

  await addPortfolioPhoto(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid salonId");
});

test("PUT /api/portfolio/:id rejects malformed serviceId", async () => {
  const photo = createPortfolioFixture({ serviceId: null });
  photo.save = async () => {
    throw new Error("save should not be called");
  };

  PortfolioPhoto.findById = async () => photo;
  Service.findById = async () => {
    throw new Error("should not reach DB with malformed id");
  };

  const res = createResponse();
  await updatePortfolioPhoto(
    {
      user: barber,
      params: { id: portfolioPhotoId },
      body: { serviceId: malformedId },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid serviceId");
});

test("PUT /api/portfolio/:id rejects malformed salonId", async () => {
  const photo = createPortfolioFixture({ salonId: null });
  photo.save = async () => {
    throw new Error("save should not be called");
  };

  PortfolioPhoto.findById = async () => photo;

  const res = createResponse();
  await updatePortfolioPhoto(
    {
      user: barber,
      params: { id: portfolioPhotoId },
      body: { salonId: badSalonId },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid salonId");
});

/* ── PUT update ── */

test("PUT /api/portfolio/:id requires barber role", async () => {
  PortfolioPhoto.findById = async () => {
    throw new Error("should not be called");
  };

  const res = createResponse();
  await updatePortfolioPhoto(
    { user: client, params: { id: portfolioPhotoId }, body: {} },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("PUT /api/portfolio/:id returns 404 for non-existent photo", async () => {
  PortfolioPhoto.findById = async () => null;

  const res = createResponse();
  await updatePortfolioPhoto(
    { user: barber, params: { id: nonexistentId }, body: {} },
    res
  );

  assert.equal(res.statusCode, 404);
});

test("PUT /api/portfolio/:id rejects non-owner update", async () => {
  const photo = createPortfolioFixture({ barberId: otherBarberId });
  photo.save = async () => {
    throw new Error("save should not be called");
  };

  PortfolioPhoto.findById = async () => photo;

  const res = createResponse();
  await updatePortfolioPhoto(
    { user: barber, params: { id: portfolioPhotoId }, body: { caption: "hacked" } },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("PUT /api/portfolio/:id allows owner to update caption and tags", async () => {
  let saved = false;
  const photo = createPortfolioFixture();
  photo.save = async () => {
    saved = true;
    return photo;
  };

  PortfolioPhoto.findById = async () => photo;

  const res = createResponse();
  await updatePortfolioPhoto(
    {
      user: barber,
      params: { id: portfolioPhotoId },
      body: {
        caption: "Updated caption",
        tags: "new, tags",
        sortOrder: 3,
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(photo.caption, "Updated caption");
  assert.deepEqual(photo.tags, ["new", "tags"]);
  assert.equal(photo.sortOrder, 3);
  assert.equal(saved, true);
});

test("PUT /api/portfolio/:id updates isPublic and consentConfirmed together", async () => {
  let saved = false;
  const photo = createPortfolioFixture({ isPublic: false, consentConfirmed: false });
  photo.save = async () => {
    saved = true;
    return photo;
  };

  PortfolioPhoto.findById = async () => photo;

  const res = createResponse();
  await updatePortfolioPhoto(
    {
      user: barber,
      params: { id: portfolioPhotoId },
      body: { isPublic: true, consentConfirmed: true },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(photo.isPublic, true);
  assert.equal(photo.consentConfirmed, true);
  assert.equal(saved, true);
});

test("PUT /api/portfolio/:id rejects isPublic true without consentConfirmed true", async () => {
  const photo = createPortfolioFixture({ isPublic: false, consentConfirmed: false });
  photo.save = async () => {
    throw new Error("save should not be called");
  };

  PortfolioPhoto.findById = async () => photo;

  const res = createResponse();
  await updatePortfolioPhoto(
    {
      user: barber,
      params: { id: portfolioPhotoId },
      body: { isPublic: true, consentConfirmed: false },
    },
    res
  );

  assert.equal(res.statusCode, 400);
});

/* ── DELETE soft-delete ── */

test("DELETE /api/portfolio/:id requires barber role", async () => {
  PortfolioPhoto.findById = async () => {
    throw new Error("should not be called");
  };

  const res = createResponse();
  await deletePortfolioPhoto(
    { user: client, params: { id: portfolioPhotoId } },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("DELETE /api/portfolio/:id returns 404 for non-existent photo", async () => {
  PortfolioPhoto.findById = async () => null;

  const res = createResponse();
  await deletePortfolioPhoto(
    { user: barber, params: { id: nonexistentId } },
    res
  );

  assert.equal(res.statusCode, 404);
});

test("DELETE /api/portfolio/:id rejects non-owner delete", async () => {
  const photo = createPortfolioFixture({ barberId: otherBarberId });
  photo.save = async () => {
    throw new Error("save should not be called");
  };

  PortfolioPhoto.findById = async () => photo;

  const res = createResponse();
  await deletePortfolioPhoto(
    { user: barber, params: { id: portfolioPhotoId } },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("DELETE /api/portfolio/:id soft-deletes by setting active to false", async () => {
  let saved = false;
  const photo = createPortfolioFixture({ active: true });
  photo.save = async function () {
    saved = true;
    return this;
  };

  PortfolioPhoto.findById = async () => photo;

  const res = createResponse();
  await deletePortfolioPhoto(
    { user: barber, params: { id: portfolioPhotoId } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(photo.active, false);
  assert.equal(saved, true);
});
