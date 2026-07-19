import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  barberProfileController,
  getBarberCardSummary,
  getProfileByBarberId,
} from "./barberProfileController.js";
import {
  addCertification,
  deleteCertification,
  getEventCertificates,
  updateCertification,
} from "./certificationController.js";
import BarberProfile from "../../models/BarberProfile.js";
import Booking from "../../models/Booking.js";
import EventCertificate from "../../models/EventCertificate.js";
import Review from "../../models/Review.js";
import Salon from "../../models/Salon.js";
import Schedule from "../../models/Schedule.js";
import Service from "../../models/Service.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import User from "../../models/User.js";
import { getArmeniaDateKey } from "../../utils/bookingDateTime.js";
import { createCanonicalPersonalSchedule } from "../../utils/personalScheduleUtils.js";

const originalMethods = {
  create: BarberProfile.create,
  findOne: BarberProfile.findOne,
  find: BarberProfile.find,
  findById: BarberProfile.findById,
  bookingFind: Booking.find,
  certificateFind: EventCertificate.find,
  reviewFind: Review.find,
  salonFind: Salon.find,
  scheduleFind: Schedule.find,
  serviceFind: Service.find,
  subscriptionFind: Subscription.find,
  subscriptionFindOne: Subscription.findOne,
  subscriptionSeatFind: SubscriptionSeat.find,
  subscriptionSeatFindOne: SubscriptionSeat.findOne,
  userFind: User.find,
  userFindById: User.findById,
};

const barber = { _id: "barber-a", role: "barber" };
const client = { _id: "client-a", role: "client" };

afterEach(() => {
  BarberProfile.create = originalMethods.create;
  BarberProfile.findOne = originalMethods.findOne;
  BarberProfile.find = originalMethods.find;
  BarberProfile.findById = originalMethods.findById;
  Booking.find = originalMethods.bookingFind;
  EventCertificate.find = originalMethods.certificateFind;
  Review.find = originalMethods.reviewFind;
  Salon.find = originalMethods.salonFind;
  Schedule.find = originalMethods.scheduleFind;
  Service.find = originalMethods.serviceFind;
  Subscription.find = originalMethods.subscriptionFind;
  Subscription.findOne = originalMethods.subscriptionFindOne;
  SubscriptionSeat.find = originalMethods.subscriptionSeatFind;
  SubscriptionSeat.findOne = originalMethods.subscriptionSeatFindOne;
  User.find = originalMethods.userFind;
  User.findById = originalMethods.userFindById;
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

const workingSchedule = (barberId) => ({
  barberId,
  weeklySchedule: createCanonicalPersonalSchedule().weeklySchedule,
});

const todayKey = getArmeniaDateKey(new Date());

const readyAvailabilitySchedule = (barberId, salonId = null) => ({
  barberId,
  salonId,
  weeklySchedule: createCanonicalPersonalSchedule().weeklySchedule,
  scheduleOverrides: {
    [todayKey]: {
      isWorking: true,
      startTime: "00:00",
      endTime: "23:59",
      breakStart: "",
      breakEnd: "",
    },
  },
  nonWorkingDays: [],
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

test("addCertification rereads the trusted profile after the expected duplicate create", async () => {
  const res = createResponse();
  const profile = createProfileWithCert();
  profile.certifications.length = 0;
  const duplicate = new Error(
    "E11000 duplicate key error index: barberprofiles_barberId_unique dup key"
  );
  duplicate.code = 11000;
  duplicate.keyPattern = { barberId: 1 };
  let reads = 0;
  let creates = 0;

  BarberProfile.findOne = async (filter) => {
    reads += 1;
    assert.deepEqual(filter, { barberId: barber._id });
    return reads === 1 ? null : profile;
  };
  BarberProfile.create = async () => {
    creates += 1;
    throw duplicate;
  };

  await addCertification(
    {
      user: barber,
      body: { title: "Cutting", issuedBy: "Academy", issueDate: "2024-01-01" },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(reads, 2);
  assert.equal(creates, 1);
  assert.equal(profile.saveCalled, true);
  assert.equal(profile.certifications.length, 1);
});

test("addCertification returns bounded 409 when duplicate create cannot be reread", async () => {
  const res = createResponse();
  const duplicate = new Error(
    "E11000 duplicate key error index: barberprofiles_barberId_unique dup key"
  );
  duplicate.code = 11000;
  duplicate.keyPattern = { barberId: 1 };
  let creates = 0;

  BarberProfile.findOne = async () => null;
  BarberProfile.create = async () => {
    creates += 1;
    throw duplicate;
  };

  await addCertification(
    {
      user: barber,
      body: { title: "Cutting", issuedBy: "Academy", issueDate: "2024-01-01" },
    },
    res
  );

  assert.equal(creates, 1);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    code: "BARBER_PROFILE_CONFLICT",
    message: "Could not save barber profile",
  });
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
    platformRole: "superuser",
    salonStatus: "none",
    salons: [
      {
        salon: salonId,
        status: "approved",
        worksAsSpecialist: true,
        isPrimary: true,
        joinedAt: new Date("2025-01-01"),
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
  Schedule.find = (query) => {
    if (query?.salonId === null) {
      return createFindChain([]);
    }

    assert.deepEqual(query, {
      barberId: { $in: [barberId] },
      salonId: { $in: [salonId] },
    });
    return createFindChain([readyAvailabilitySchedule(barberId, salonId)]);
  };
  mockPaidAccessForAllBarbers([barberId]);

  await getBarberCardSummary({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.barbers.length, 1);
  assert.equal(res.body.services.length, 1);
  assert.equal(res.body.reviewStats[0].average, 5);
  assert.equal(res.body.reviewStats[0].count, 1);
  assert.equal(res.body.availability[0].barberId, barberId);
  assert.equal(res.body.availability[0].status, "ready");
  assert.equal(res.body.barbers[0].platformRole, undefined);
  assert.equal(res.body.barbers[0].address, undefined);
  assert.equal(res.body.barbers[0].phone, undefined);
  assert.equal(res.body.barbers[0].approvedSalons[0].isPrimary, true);
  assert.equal(res.body.barbers[0].approvedSalons[0].status, undefined);
  assert.equal(res.body.barbers[0].approvedSalons[0].joinedAt, undefined);
});

test("card summary exposes only eligible canonical salon associations", async () => {
  const res = createResponse();
  const barberId = "64b000000000000000001001";
  const eligibleSalonId = "64b000000000000000001002";
  const rejectedSalonId = "64b000000000000000001003";
  const nonSpecialistSalonId = "64b000000000000000001004";
  const staleLegacySalonId = "64b000000000000000001005";
  const barber = {
    _id: barberId,
    name: "Scoped Barber",
    role: "barber",
    salonStatus: "approved",
    salon: staleLegacySalonId,
    salons: [
      { salon: eligibleSalonId, status: "approved", worksAsSpecialist: true, isPrimary: true },
      { salon: rejectedSalonId, status: "approved", relationshipStatus: "rejected", worksAsSpecialist: true },
      { salon: nonSpecialistSalonId, status: "approved", worksAsSpecialist: false },
    ],
  };
  const salons = [
    { _id: eligibleSalonId, name: "Eligible Salon" },
    { _id: rejectedSalonId, name: "Rejected Salon" },
    { _id: nonSpecialistSalonId, name: "Non Specialist Salon" },
    { _id: staleLegacySalonId, name: "Stale Legacy Salon" },
  ].map((salon) => ({ ...salon, toObject() { return { ...this }; } }));

  User.find = () => createFindChain([barber]);
  BarberProfile.find = () => createFindChain([]);
  Salon.find = (query) => {
    assert.deepEqual(query._id.$in, [eligibleSalonId]);
    return createFindChain(salons.filter((salon) => query._id.$in.includes(salon._id)));
  };
  Service.find = () => createFindChain([{ _id: "service-1", barberId, active: true }]);
  Review.find = () => createFindChain([]);
  Booking.find = () => createFindChain([]);
  Schedule.find = () => createFindChain([]);
  mockPaidAccessForAllBarbers([barberId]);

  await getBarberCardSummary({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.barbers.length, 1);
  assert.deepEqual(res.body.barbers[0].approvedSalons.map((salon) => salon.name), ["Eligible Salon"]);
  assert.equal(res.body.barbers[0].salonName, "Eligible Salon");
  assert.equal(res.body.barbers[0].salon.name, "Eligible Salon");
});

test("card summary keeps independent-ready barber visible without salon associations", async () => {
  const res = createResponse();
  const barberId = "64b000000000000000001011";
  const staleLegacySalonId = "64b000000000000000001012";

  User.find = () => createFindChain([
    {
      _id: barberId,
      name: "Independent Barber",
      role: "barber",
      salonStatus: "approved",
      salon: staleLegacySalonId,
      salons: [],
    },
  ]);
  BarberProfile.find = () => createFindChain([{ barberId, address: "Independent Street 1" }]);
  Salon.find = (query) => {
    assert.deepEqual(query._id.$in, []);
    return createFindChain([]);
  };
  Service.find = () => createFindChain([{ _id: "service-1", barberId, active: true }]);
  Review.find = () => createFindChain([]);
  Booking.find = () => createFindChain([]);
  Schedule.find = (query) => {
    if (query?.salonId === null) {
      return createFindChain([readyAvailabilitySchedule(barberId, null)]);
    }
    return createFindChain([]);
  };
  mockPaidAccessForAllBarbers([barberId]);

  await getBarberCardSummary({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.barbers.length, 1);
  assert.deepEqual(res.body.barbers[0].approvedSalons, []);
  assert.deepEqual(res.body.barbers[0].salons, []);
  assert.equal(res.body.barbers[0].salon, null);
  assert.equal(res.body.availability[0].status, "ready");
  assert.equal(res.body.availability[0].firstAvailableSlot?.salonId, null);
});

test("card summary marks barber unavailable when exact independent and salon schedules are missing", async () => {
  const res = createResponse();
  const barberId = "64b000000000000000001013";
  const salonId = "64b000000000000000001014";

  User.find = () => createFindChain([
    {
      _id: barberId,
      name: "Hybrid Barber",
      role: "barber",
      salons: [
        { salon: salonId, status: "approved", worksAsSpecialist: true, isPrimary: true },
      ],
    },
  ]);
  BarberProfile.find = () => createFindChain([{ barberId, address: "Hybrid Street 1" }]);
  Salon.find = () => createFindChain([{ _id: salonId, name: "Eligible Salon", toObject() { return { _id: salonId, name: "Eligible Salon" }; } }]);
  Service.find = () => createFindChain([{ _id: "service-1", barberId, active: true, duration: 20 }]);
  Review.find = () => createFindChain([]);
  Booking.find = () => createFindChain([]);
  Schedule.find = () => createFindChain([]);
  mockPaidAccessForAllBarbers([barberId]);

  await getBarberCardSummary({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.availability[0].status, "unavailable");
  assert.equal(res.body.availability[0].firstAvailableSlot, null);
  assert.equal(res.body.barbers[0].approvedSalons.length, 1);
});

test("card summary exact contexts ignore default fallback and preserve privacy shape", async () => {
  const res = createResponse();
  const barberId = "64b000000000000000001015";
  const salonId = "64b000000000000000001016";

  User.find = () => createFindChain([
    {
      _id: barberId,
      name: "Scoped Availability Barber",
      role: "barber",
      salons: [
        {
          salon: salonId,
          status: "approved",
          worksAsSpecialist: true,
          isPrimary: true,
          defaultSchedule: {
            startTime: "00:00",
            endTime: "23:59",
            hasBreak: false,
          },
        },
      ],
    },
  ]);
  BarberProfile.find = () => createFindChain([{ barberId, address: "Scoped Street 1", phone: "private" }]);
  Salon.find = () => createFindChain([{ _id: salonId, name: "Scoped Salon", toObject() { return { _id: salonId, name: "Scoped Salon" }; } }]);
  Service.find = () => createFindChain([{ _id: "service-1", barberId, active: true, duration: 20 }]);
  Review.find = () => createFindChain([]);
  Booking.find = () => createFindChain([]);
  Schedule.find = () => createFindChain([
    {
      barberId,
      salonId,
      weeklySchedule: {},
      defaultSchedule: {
        startTime: "00:00",
        endTime: "23:59",
        hasBreak: false,
      },
    },
  ]);
  mockPaidAccessForAllBarbers([barberId]);

  await getBarberCardSummary({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.availability[0].status, "unavailable");
  assert.equal(res.body.availability[0].firstAvailableSlot, null);
  assert.equal(res.body.barbers[0].address, undefined);
  assert.equal(res.body.barbers[0].phone, undefined);
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
        worksAsSpecialist: true,
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

test("card summary service query only returns active services publicly", async () => {
  const res = createResponse();
  const barberId = "64b000000000000000000021";
  const salonId = "64b000000000000000000022";
  const barber = {
    _id: barberId,
    name: "Active Specialist",
    role: "barber",
    salons: [{ salon: salonId, status: "approved", isPrimary: true, worksAsSpecialist: true }],
  };
  const salon = {
    _id: salonId,
    name: "Salon",
    toObject() {
      return { _id: salonId, name: "Salon" };
    },
  };
  const allServices = [
    {
      _id: "service-active",
      barberId,
      name: "Haircut",
      category: "haircut",
      price: 100,
      duration: 20,
      active: true,
    },
    {
      _id: "service-inactive",
      barberId,
      name: "Hidden Color",
      category: "hair-color",
      price: 100,
      duration: 20,
      active: false,
    },
  ];
  let capturedServiceQuery;

  User.find = () => createFindChain([barber]);
  BarberProfile.find = () => createFindChain([]);
  Salon.find = () => createFindChain([salon]);
  Service.find = (query) => {
    capturedServiceQuery = query;
    return createFindChain(
      query.active === true
        ? allServices.filter((service) => service.active)
        : allServices
    );
  };
  Review.find = () => createFindChain([]);
  Booking.find = () => createFindChain([]);
  Schedule.find = () => createFindChain([]);
  mockPaidAccessForAllBarbers([barberId]);

  await getBarberCardSummary({}, res);

  assert.deepEqual(capturedServiceQuery, {
    barberId: { $in: [barberId] },
    active: true,
  });
  assert.deepEqual(res.body.services.map((service) => service._id), [
    "service-active",
  ]);
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

test("getProfileByBarberId returns 404 for unpaid barber", async () => {
  const res = createResponse();
  const unpaidBarberId = "64b000000000000000000999";
  const barber = {
    _id: unpaidBarberId,
    name: "Unpaid Barber",
    phone: "100",
    role: "barber",
    city: "City",
    salons: [],
    salon: null,
    salonStatus: "none",
    createdAt: new Date("2024-01-01"),
    toObject() {
      return { ...this };
    },
  };

  BarberProfile.findOne = async () => null;
  // getProfileByBarberId calls User.findById(id).select("-password")
  User.findById = () => ({
    select: async () => barber,
  });
  // barberHasPaidAccess calls findOne on Subscription and SubscriptionSeat
  Subscription.findOne = async () => null;
  SubscriptionSeat.findOne = () => ({
    populate: async () => null,
  });

  await getProfileByBarberId({ params: { barberId: unpaidBarberId } }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Barber not found");
});

test("getProfileByBarberId omits private User and BarberProfile fields", async () => {
  const res = createResponse();
  const barberId = "public-barber";
  const privateProfile = {
    _id: "profile-1",
    barberId,
    city: "Yerevan",
    bio: "Public bio",
    instagram: "public_handle",
    address: "Private Street 1",
    depositSettings: { enabled: true, value: 25 },
    certifications: [{ title: "Private" }],
    toObject() { return { ...this }; },
  };
  BarberProfile.findOne = async () => privateProfile;
  BarberProfile.find = () => createFindChain([privateProfile]);
  User.findById = () => ({
    select: async () => ({
      _id: barberId,
      role: "barber",
      name: "Public Barber",
      phone: "555-private",
      city: "Yerevan",
      profession: "barber",
      barberType: "men",
      specialty: "men",
      salons: [{ salon: "salon-1", status: "approved", worksAsSpecialist: true }],
      salonStatus: "pending",
      workHistory: [{
        salon: {
          _id: "salon-1",
          name: "Private Salon",
          address: "Private Salon Street",
          ownerId: "owner-private",
          admins: ["admin-private"],
          staffPayment: { fixedAmount: 5000 },
          unknownFutureField: "private",
        },
        salonName: "Public Salon",
      }],
    }),
  });
  User.find = () => createFindChain([
    {
      _id: barberId,
      role: "barber",
      salons: [{ salon: "salon-1", status: "approved", worksAsSpecialist: true }],
    },
  ]);
  Service.find = () => createFindChain([{ barberId, active: true }]);
  Schedule.find = () => createFindChain([]);
  Subscription.findOne = async () => ({ status: "active", currentPeriodEnd: new Date("2099-01-01") });
  Salon.find = () => createFindChain([
    { _id: "salon-1", name: "Public Salon", toObject() { return { ...this }; } },
  ]);

  await getProfileByBarberId({ params: { barberId } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.city, "Yerevan");
  assert.equal(res.body.bio, "Public bio");
  assert.equal(res.body.address, undefined);
  assert.equal(res.body.phone, undefined);
  assert.equal(res.body.depositSettings, undefined);
  assert.equal(res.body.certifications, undefined);
  assert.equal(res.body.salonStatus, undefined);
  assert.equal(res.body.workHistory[0].salonName, "Public Salon");
  assert.equal(res.body.workHistory[0].salon, "salon-1");
});

test("getProfileByBarberId prefers eligible canonical salon and ignores stale legacy fields", async () => {
  const res = createResponse();
  const barberId = "public-scoped-barber";
  const eligibleSalonId = "eligible-salon";
  const staleLegacySalonId = "stale-legacy-salon";
  const barber = {
    _id: barberId,
    role: "barber",
    name: "Scoped Barber",
    salonStatus: "approved",
    salon: staleLegacySalonId,
    salons: [
      { salon: eligibleSalonId, status: "approved", worksAsSpecialist: true, isPrimary: true },
      { salon: "pending-salon", status: "pending", worksAsSpecialist: true },
      { salon: "non-specialist-salon", status: "approved", worksAsSpecialist: false },
    ],
  };

  BarberProfile.findOne = async () => ({ barberId, city: "Yerevan", toObject() { return { ...this }; } });
  BarberProfile.find = () => createFindChain([{ barberId, city: "Yerevan" }]);
  User.findById = () => ({ select: async () => barber });
  User.find = () => createFindChain([barber]);
  Service.find = () => createFindChain([{ barberId, active: true }]);
  Schedule.find = () => createFindChain([]);
  Subscription.findOne = async () => ({ status: "active", currentPeriodEnd: new Date("2099-01-01") });
  Salon.find = (query) => {
    assert.deepEqual(query._id.$in, [eligibleSalonId]);
    return createFindChain([
      { _id: eligibleSalonId, name: "Eligible Salon", toObject() { return { ...this }; } },
    ]);
  };

  await getProfileByBarberId({ params: { barberId } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.salon.name, "Eligible Salon");
  assert.equal(res.body.salonName, "Eligible Salon");
});

test("getProfileByBarberId keeps independent-ready barber visible without stale legacy salon", async () => {
  const res = createResponse();
  const barberId = "public-independent-barber";
  const barber = {
    _id: barberId,
    role: "barber",
    name: "Independent Barber",
    salonStatus: "approved",
    salon: "stale-legacy-salon",
    salons: [],
  };

  BarberProfile.findOne = async () => ({ barberId, city: "Yerevan", address: "Independent Street 1", toObject() { return { ...this }; } });
  BarberProfile.find = () => createFindChain([{ barberId, city: "Yerevan", address: "Independent Street 1" }]);
  User.findById = () => ({ select: async () => barber });
  User.find = () => createFindChain([barber]);
  Service.find = () => createFindChain([{ barberId, active: true }]);
  Schedule.find = () => createFindChain([workingSchedule(barberId)]);
  Subscription.findOne = async () => ({ status: "active", currentPeriodEnd: new Date("2099-01-01") });
  Salon.find = () => {
    throw new Error("legacy salon should not be queried");
  };

  await getProfileByBarberId({ params: { barberId } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.salon, null);
  assert.equal(res.body.salonName, "");
  assert.equal(res.body.address, undefined);
});

test("generic public BarberProfile GET handlers serialize list and detail responses", async () => {
  const privateProfile = {
    _id: "profile-1",
    barberId: "barber-1",
    city: "Gyumri",
    bio: "Public bio",
    address: "Private Street 1",
    depositSettings: { enabled: true },
    unknownFutureField: "private",
    toObject() { return { ...this }; },
  };
  BarberProfile.find = async () => [privateProfile];
  BarberProfile.findById = async () => privateProfile;
  User.find = () => createFindChain([{ _id: "barber-1", role: "barber" }]);
  Schedule.find = () => createFindChain([workingSchedule("barber-1")]);
  Service.find = () => createFindChain([{ barberId: "barber-1", active: true }]);

  const listRes = createResponse();
  await barberProfileController.getAll({}, listRes);
  assert.equal(listRes.statusCode, 200);
  assert.equal(listRes.body.length, 1);
  assert.equal(listRes.body[0].city, "Gyumri");
  assert.equal(listRes.body[0].address, undefined);
  assert.equal(listRes.body[0].depositSettings, undefined);
  assert.equal(listRes.body[0].unknownFutureField, undefined);

  const detailRes = createResponse();
  await barberProfileController.getById({ params: { id: "profile-1" } }, detailRes);
  assert.equal(detailRes.statusCode, 200);
  assert.equal(detailRes.body.address, undefined);
  assert.equal(detailRes.body.bio, "Public bio");
});

test("getProfileByBarberId returns 404 for paid barber without active public readiness", async () => {
  const res = createResponse();
  const barberId = "paid-unready";

  BarberProfile.findOne = async () => ({
    barberId,
    city: "Yerevan",
    bio: "Hidden",
    toObject() {
      return { ...this };
    },
  });
  BarberProfile.find = () => createFindChain([{ barberId, city: "Yerevan", bio: "Hidden" }]);
  User.findById = () => ({
    select: async () => ({
      _id: barberId,
      role: "barber",
      name: "Paid Unready",
      specialistOnboarding: {
        version: 1,
        status: "completed",
        currentStep: null,
        workplace: "independent",
        completedAt: new Date("2026-07-16T10:00:00.000Z"),
      },
    }),
  });
  User.find = () => createFindChain([
    {
      _id: barberId,
      role: "barber",
      specialistOnboarding: {
        version: 1,
        status: "completed",
        currentStep: null,
        workplace: "independent",
        completedAt: new Date("2026-07-16T10:00:00.000Z"),
      },
    },
  ]);
  Service.find = () => createFindChain([]);
  Schedule.find = () => createFindChain([]);
  Subscription.findOne = async () => ({ status: "active", currentPeriodEnd: new Date("2099-01-01") });

  await getProfileByBarberId({ params: { barberId } }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Barber not found");
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
  let capturedServiceQuery;
  Service.find = (query) => {
    capturedServiceQuery = query;
    return {
      populate(opts) {
        capturedPopulate = opts;
        return { lean: async () => [] };
      },
    };
  };

  await getBarberCardSummary({}, res);

  assert.equal(res.statusCode, 200);
  assert.ok(capturedPopulate, "populate must be called on services");
  assert.equal(capturedPopulate.path, "customCategoryId");
  assert.equal(capturedPopulate.match?.active, true);
  // active is excluded from select
  assert.equal(capturedPopulate.select?.includes("active"), false);
  assert.equal(capturedServiceQuery.active, true);
});
