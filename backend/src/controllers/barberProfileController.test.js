import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  getBarberCardSummary,
} from "./barberProfileController.js";
import {
  addCertification,
  deleteCertification,
  getEventCertificates,
  updateCertification,
} from "./certificationController.js";
import BarberProfile from "../models/BarberProfile.js";
import Booking from "../models/Booking.js";
import EventCertificate from "../models/EventCertificate.js";
import Review from "../models/Review.js";
import Salon from "../models/Salon.js";
import Schedule from "../models/Schedule.js";
import Service from "../models/Service.js";
import Subscription from "../models/Subscription.js";
import SubscriptionSeat from "../models/SubscriptionSeat.js";
import User from "../models/User.js";

const originalMethods = {
  create: BarberProfile.create,
  findOne: BarberProfile.findOne,
  find: BarberProfile.find,
  bookingFind: Booking.find,
  certificateFind: EventCertificate.find,
  reviewFind: Review.find,
  salonFind: Salon.find,
  scheduleFind: Schedule.find,
  serviceFind: Service.find,
  subscriptionFind: Subscription.find,
  subscriptionSeatFind: SubscriptionSeat.find,
  userFind: User.find,
};

const barber = { _id: "barber-a", role: "barber" };
const client = { _id: "client-a", role: "client" };

afterEach(() => {
  BarberProfile.create = originalMethods.create;
  BarberProfile.findOne = originalMethods.findOne;
  BarberProfile.find = originalMethods.find;
  Booking.find = originalMethods.bookingFind;
  EventCertificate.find = originalMethods.certificateFind;
  Review.find = originalMethods.reviewFind;
  Salon.find = originalMethods.salonFind;
  Schedule.find = originalMethods.scheduleFind;
  Service.find = originalMethods.serviceFind;
  Subscription.find = originalMethods.subscriptionFind;
  SubscriptionSeat.find = originalMethods.subscriptionSeatFind;
  User.find = originalMethods.userFind;
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

const createProfileWithCert = (certOverrides = {}) => {
  const cert = {
    _id: "cert-a",
    title: "Safety Certificate",
    issuedBy: "Academy",
    issueDate: new Date("2024-01-01"),
    expiryDate: new Date("2025-01-01"),
    imageUrl: "",
    description: "",
    ...certOverrides,
  };
  const certifications = [cert];

  certifications.id = (id) => (String(id) === String(cert._id) ? cert : null);
  certifications.pull = (id) => {
    const index = certifications.findIndex(
      (item) => String(item._id) === String(id)
    );

    if (index >= 0) certifications.splice(index, 1);
  };

  return {
    certifications,
    saveCalled: false,
    async save() {
      this.saveCalled = true;
      return this;
    },
  };
};

const createFindChain = (result) => ({
  select: () => createFindChain(result),
  populate: () => createFindChain(result),
  lean: async () => result,
  then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
});

const mockPaidAccessForAllBarbers = (barberIds) => {
  Subscription.find = () =>
    createFindChain(barberIds.map((barberId) => ({ ownerId: barberId })));
  SubscriptionSeat.find = () => createFindChain([]);
};

test("clients cannot add, update, or delete barber certifications", async () => {
  let findOneCalled = false;

  BarberProfile.findOne = async () => {
    findOneCalled = true;
    return null;
  };
  BarberProfile.create = async () => {
    throw new Error("create should not be called");
  };

  for (const handler of [addCertification, updateCertification, deleteCertification]) {
    const res = createResponse();

    await handler(
      {
        user: client,
        params: { certId: "cert-a" },
        body: {
          title: "Cutting",
          issuedBy: "Academy",
          issueDate: "2024-01-01",
        },
      },
      res
    );

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.message, "Only barbers can manage certifications");
  }

  assert.equal(findOneCalled, false);
});

test("add certification rejects invalid issue and expiry dates", async () => {
  BarberProfile.create = async () => {
    throw new Error("create should not be called");
  };
  BarberProfile.findOne = async () => null;

  const invalidBodies = [
    {
      title: "Cutting",
      issuedBy: "Academy",
      issueDate: "not-a-date",
    },
    {
      title: "Cutting",
      issuedBy: "Academy",
      issueDate: "2999-01-01",
    },
    {
      title: "Cutting",
      issuedBy: "Academy",
      issueDate: "2024-01-01",
      expiryDate: "not-a-date",
    },
    {
      title: "Cutting",
      issuedBy: "Academy",
      issueDate: "2024-01-01",
      expiryDate: "2023-12-31",
    },
  ];

  for (const body of invalidBodies) {
    const res = createResponse();

    await addCertification({ user: barber, body }, res);

    assert.equal(res.statusCode, 400);
  }
});

test("barber can add certification with valid data", async () => {
  const res = createResponse();
  let createdPayload;

  BarberProfile.findOne = async () => null;
  BarberProfile.create = async (payload) => {
    createdPayload = payload;
    return {
      certifications: [
        {
          _id: "cert-a",
          ...payload.certifications[0],
        },
      ],
    };
  };

  await addCertification(
    {
      user: barber,
      body: {
        title: " Cutting Certificate ",
        issuedBy: " Academy ",
        issueDate: "2024-01-01",
        expiryDate: "2025-01-01",
        description: " Trims ",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.barberId, barber._id);
  assert.equal(res.body.title, "Cutting Certificate");
  assert.equal(res.body.issuedBy, "Academy");
  assert.equal(res.body.description, "Trims");
});

test("card summary returns barber card data without per-barber requests", async () => {
  const res = createResponse();
  const barberId = "64b000000000000000000001";
  const salonId = "64b000000000000000000002";
  const serviceId = "64b000000000000000000003";
  const barber = {
    _id: barberId,
    name: "Barber",
    phone: "100",
    city: "City",
    avatarUrl: "/uploads/avatars/barber.png",
    role: "barber",
    salonStatus: "none",
    salons: [
      {
        salon: salonId,
        status: "approved",
        isPrimary: true,
        defaultSchedule: {
          startTime: "00:00",
          endTime: "23:59",
          hasBreak: false,
        },
      },
    ],
    createdAt: new Date("2024-01-01"),
  };
  const salon = {
    _id: salonId,
    name: "Salon",
    city: "City",
    toObject() {
      return { _id: salonId, name: "Salon", city: "City" };
    },
  };
  const service = {
    _id: serviceId,
    barberId,
    name: "Haircut",
    price: 100,
    duration: 20,
    active: true,
  };

  User.find = () => createFindChain([barber]);
  BarberProfile.find = () => createFindChain([]);
  Salon.find = () => createFindChain([salon]);
  Service.find = () => createFindChain([service]);
  Review.find = () => createFindChain([{ barberId, rating: 5 }]);
  Booking.find = () => createFindChain([]);
  Schedule.find = () => createFindChain([]);
  mockPaidAccessForAllBarbers([barberId]);

  await getBarberCardSummary({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.barbers.length, 1);
  assert.equal(res.body.services.length, 1);
  assert.equal(res.body.reviewStats[0].average, 5);
  assert.equal(res.body.reviewStats[0].count, 1);
  assert.equal(res.body.availability[0].barberId, barberId);
  assert.equal(res.body.availability[0].status, "ready");
});

test("card summary filters specialists by active service category and tags", async () => {
  const res = createResponse();
  const salonId = "64b000000000000000000010";
  const nailBarberId = "64b000000000000000000011";
  const hairBarberId = "64b000000000000000000012";
  const makeBarber = (barberId, name) => ({
    _id: barberId,
    name,
    phone: "100",
    city: "City",
    role: "barber",
    salonStatus: "none",
    salons: [
      {
        salon: salonId,
        status: "approved",
        isPrimary: true,
        defaultSchedule: {
          startTime: "00:00",
          endTime: "23:59",
          hasBreak: false,
        },
      },
    ],
  });
  const salon = {
    _id: salonId,
    name: "Salon",
    toObject() {
      return { _id: salonId, name: "Salon" };
    },
  };

  User.find = () => createFindChain([
    makeBarber(nailBarberId, "Nail Specialist"),
    makeBarber(hairBarberId, "Hair Specialist"),
  ]);
  BarberProfile.find = () => createFindChain([]);
  Salon.find = () => createFindChain([salon]);
  Service.find = () => createFindChain([
    {
      _id: "service-nails",
      barberId: nailBarberId,
      name: "Gel Manicure",
      category: "nails",
      tags: ["gel"],
      price: 100,
      duration: 20,
      active: true,
    },
    {
      _id: "service-inactive",
      barberId: hairBarberId,
      name: "Nail Repair",
      category: "nails",
      tags: ["repair"],
      price: 100,
      duration: 20,
      active: false,
    },
    {
      _id: "service-hair",
      barberId: hairBarberId,
      name: "Haircut",
      category: "haircut",
      tags: ["cut"],
      price: 100,
      duration: 20,
      active: true,
    },
  ]);
  Review.find = () => createFindChain([]);
  Booking.find = () => createFindChain([]);
  Schedule.find = () => createFindChain([]);
  mockPaidAccessForAllBarbers([nailBarberId, hairBarberId]);

  await getBarberCardSummary({ query: { category: "nails", serviceName: "gel" } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.barbers.map((barber) => barber.id), [nailBarberId]);
  assert.deepEqual(res.body.services.map((service) => service._id), ["service-nails"]);
});

test("card summary rejects invalid service category query", async () => {
  const res = createResponse();

  await getBarberCardSummary({ query: { category: "fitness" } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid service category");
});

test("update certification rejects issue date that would invalidate existing expiry", async () => {
  const res = createResponse();
  const profile = createProfileWithCert();

  BarberProfile.findOne = async () => profile;

  await updateCertification(
    {
      user: barber,
      params: { certId: "cert-a" },
      body: {
        issueDate: "2025-02-01",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Expiry date must be after issue date");
  assert.equal(profile.saveCalled, false);
});

test("barber can delete their own certification", async () => {
  const res = createResponse();
  const profile = createProfileWithCert();

  BarberProfile.findOne = async () => profile;

  await deleteCertification(
    {
      user: barber,
      params: { certId: "cert-a" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(profile.certifications.length, 0);
  assert.equal(profile.saveCalled, true);
});

test("public barber event certificates include issued safe certificate data only", async () => {
  const res = createResponse();
  const certificates = [
    {
      certificateId: "CERT-2026-ISSUED",
      verificationCode: "SECRET",
      userId: barber._id,
      eventTitle: "Color Workshop",
      organizerName: "Organizer",
      salonName: "Main Salon",
      eventDate: "2026-01-01",
      issuedAt: new Date("2026-01-02T10:00:00Z"),
      status: "issued",
      certificateType: "uploaded",
      fileUrl: "/uploads/certificate-files/cert.pdf",
      fileType: "application/pdf",
      originalFileName: "cert.pdf",
    },
  ];
  let findQuery;

  EventCertificate.find = (query) => {
    findQuery = query;

    return {
      select() {
        return this;
      },
      sort() {
        return this;
      },
      lean: async () => certificates,
    };
  };

  await getEventCertificates(
    {
      params: { barberId: barber._id },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(findQuery, { userId: barber._id, status: "issued" });
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].certificateId, "CERT-2026-ISSUED");
  assert.equal(res.body[0].certificateType, "uploaded");
  assert.equal(res.body[0].verificationCode, undefined);
  assert.equal(res.body[0].email, undefined);
  assert.equal(res.body[0].phone, undefined);
});

test("card summary populate uses active-only match for customCategoryId", async () => {
  const res = createResponse();
  const barberId = "64b000000000000000000001";

  User.find = () => ({
    select: () => ({
      then: (resolve) =>
        resolve([
          { _id: barberId, role: "barber", salons: [], createdAt: new Date("2024-01-01") },
        ]),
    }),
  });
  BarberProfile.find = () => createFindChain([]);
  Salon.find = () => createFindChain([]);
  Review.find = () => createFindChain([]);
  Booking.find = () => createFindChain([]);
  Schedule.find = () => createFindChain([]);
  mockPaidAccessForAllBarbers([barberId]);

  let capturedPopulate;
  Service.find = () => ({
    populate(opts) {
      capturedPopulate = opts;
      return { lean: async () => [] };
    },
  });

  await getBarberCardSummary({}, res);

  assert.equal(res.statusCode, 200);
  assert.ok(capturedPopulate, "populate must be called on services");
  assert.equal(capturedPopulate.path, "customCategoryId");
  assert.equal(capturedPopulate.match?.active, true);
  // active is excluded from select
  assert.equal(capturedPopulate.select?.includes("active"), false);
});
