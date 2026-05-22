import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  getCertificateById,
  issueEventRegistrationCertificate,
  revokeCertificate,
  verifyCertificate,
} from "./certificateController.js";
import Event from "../models/Event.js";
import EventCertificate from "../models/EventCertificate.js";
import EventRegistration from "../models/EventRegistration.js";
import Notification from "../models/Notification.js";
import Salon from "../models/Salon.js";
import User from "../models/User.js";

const originalMethods = {
  eventFindById: Event.findById,
  certificateCreate: EventCertificate.create,
  certificateFindOne: EventCertificate.findOne,
  registrationFindOne: EventRegistration.findOne,
  notificationCreate: Notification.create,
  salonFindById: Salon.findById,
  userFindById: User.findById,
};

const organizerId = "64c000000000000000000001";
const attendeeId = "64c000000000000000000002";
const otherUserId = "64c000000000000000000003";
const eventId = "64c000000000000000000004";
const registrationId = "64c000000000000000000005";

afterEach(() => {
  Event.findById = originalMethods.eventFindById;
  EventCertificate.create = originalMethods.certificateCreate;
  EventCertificate.findOne = originalMethods.certificateFindOne;
  EventRegistration.findOne = originalMethods.registrationFindOne;
  Notification.create = originalMethods.notificationCreate;
  Salon.findById = originalMethods.salonFindById;
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

const selectable = (value) => ({
  select: async () => value,
});

const queryable = (value) => ({
  lean: async () => value,
  then(resolve, reject) {
    return Promise.resolve(value).then(resolve, reject);
  },
});

const baseEvent = {
  _id: eventId,
  title: "Color Workshop",
  date: "2020-01-01",
  time: "10:00",
  duration: 60,
  organizerId,
  salonId: null,
  certificatesEnabled: true,
};

const createRegistration = (overrides = {}) => ({
  _id: registrationId,
  eventId,
  userId: attendeeId,
  status: "approved",
  attended: true,
  attendanceStatus: "attended",
  certificateId: null,
  certificateIssuedAt: null,
  async save() {
    return this;
  },
  ...overrides,
});

const matchesCertificateQuery = (certificate, query = {}) => {
  if (query.$or) {
    return query.$or.some((condition) =>
      matchesCertificateQuery(certificate, condition)
    );
  }

  return Object.entries(query).every(
    ([key, value]) => String(certificate[key] || "") === String(value || "")
  );
};

const createCertificate = (payload = {}) => ({
  _id: "64c000000000000000000006",
  eventId,
  registrationId,
  userId: attendeeId,
  organizerId,
  certificateId: "CERT-2026-ABC123",
  verificationCode: "VERIFY123",
  participantName: "Participant",
  eventTitle: "Color Workshop",
  organizerName: "Organizer",
  salonName: "",
  eventDate: "2020-01-01",
  issuedAt: new Date("2020-01-02T10:00:00Z"),
  status: "issued",
  revokedAt: null,
  revokedReason: "",
  async save() {
    return this;
  },
  ...payload,
});

const createControllerMocks = ({
  event = { ...baseEvent },
  registration = createRegistration(),
  certificates = [],
  notifications = [],
} = {}) => {
  Event.findById = async (id) =>
    String(id) === String(event?._id) ? event : null;
  EventRegistration.findOne = async (query) =>
    String(query?._id) === String(registration?._id) &&
    String(query?.eventId) === String(registration?.eventId)
      ? registration
      : null;
  EventCertificate.findOne = (query) =>
    queryable(
      certificates.find((certificate) =>
        matchesCertificateQuery(certificate, query)
      ) || null
    );
  EventCertificate.create = async (payload) => {
    const certificate = createCertificate(payload);
    certificates.push(certificate);
    return certificate;
  };
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Salon.findById = async () => null;
  User.findById = (id) =>
    selectable({
      _id: id,
      name: String(id) === String(organizerId) ? "Organizer" : "Participant",
    });

  return { certificates, notifications, registration };
};

const issueCertificate = async ({ userId = organizerId } = {}) => {
  const res = createResponse();

  await issueEventRegistrationCertificate(
    {
      params: { eventId, registrationId },
      user: { _id: userId, name: "Organizer" },
    },
    res
  );

  return res;
};

test("organizer can issue certificate after approval, attendance, ended event, and enabled setting", async () => {
  const { notifications, registration } = createControllerMocks();

  const res = await issueCertificate();

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.certificate.certificateId.startsWith("CERT-"), true);
  assert.equal(Boolean(registration.certificateId), true);
  assert.equal(registration.certificateIssuedAt instanceof Date, true);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "event_certificate_issued");
});

for (const status of ["pending", "rejected", "cancelled", "waitlisted"]) {
  test(`cannot issue certificate when registration is ${status}`, async () => {
    createControllerMocks({
      registration: createRegistration({ status }),
    });

    const res = await issueCertificate();

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "Participant must be approved");
  });
}

test("cannot issue certificate when participant is not attended", async () => {
  createControllerMocks({
    registration: createRegistration({ attended: false, attendanceStatus: "pending" }),
  });

  const res = await issueCertificate();

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Participant must be marked as attended");
});

test("cannot issue certificate before event ends", async () => {
  createControllerMocks({
    event: { ...baseEvent, date: "2099-01-01", time: "10:00" },
  });

  const res = await issueCertificate();

  assert.equal(res.statusCode, 400);
  assert.equal(
    res.body.message,
    "Certificate can be issued only after the event ends"
  );
});

test("cannot issue certificate when certificates are disabled", async () => {
  createControllerMocks({
    event: { ...baseEvent, certificatesEnabled: false },
  });

  const res = await issueCertificate();

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Certificates are not enabled for this event");
});

test("duplicate certificate for same registration is blocked", async () => {
  createControllerMocks({
    certificates: [createCertificate()],
  });

  const res = await issueCertificate();

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Certificate already issued");
});

test("non-organizer cannot issue certificate", async () => {
  createControllerMocks();

  const res = await issueCertificate({ userId: otherUserId });

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "Only organizer can issue certificates");
});

test("participant cannot issue own certificate", async () => {
  createControllerMocks();

  const res = await issueCertificate({ userId: attendeeId });

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "Only organizer can issue certificates");
});

test("issued certificate can be fetched by public endpoint", async () => {
  const certificate = createCertificate();
  createControllerMocks({ certificates: [certificate] });
  const res = createResponse();

  await getCertificateById(
    { params: { certificateId: certificate.certificateId } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.certificateId, certificate.certificateId);
  assert.equal(res.body.participantName, "Participant");
  assert.equal(res.body.email, undefined);
  assert.equal(res.body.verificationCode, undefined);
  assert.equal(res.body.certificateType, "auto");
  assert.equal(res.body.fileUrl, "");
  assert.equal(res.body.fileType, "");
  assert.equal(res.body.originalFileName, "");
});

test("issued certificate can be fetched by public verification endpoint", async () => {
  const certificate = createCertificate();
  createControllerMocks({ certificates: [certificate] });
  const res = createResponse();

  await verifyCertificate(
    { params: { verificationCode: certificate.verificationCode } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.certificateId, certificate.certificateId);
  assert.equal(res.body.email, undefined);
  assert.equal(res.body.verificationCode, undefined);
});

test("uploaded certificate payload exposes uploaded file metadata and no verification code", async () => {
  const certificate = createCertificate({
    certificateType: "uploaded",
    fileUrl: "/uploads/certificate-files/cert.pdf",
    fileType: "application/pdf",
    originalFileName: "cert.pdf",
  });
  createControllerMocks({ certificates: [certificate] });
  const res = createResponse();

  await getCertificateById(
    { params: { certificateId: certificate.certificateId } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.certificateType, "uploaded");
  assert.equal(res.body.fileUrl, "/uploads/certificate-files/cert.pdf");
  assert.equal(res.body.fileType, "application/pdf");
  assert.equal(res.body.originalFileName, "cert.pdf");
  assert.equal(res.body.verificationCode, undefined);
});

test("organizer can revoke an issued certificate and revoked status is returned", async () => {
  const certificate = createCertificate();
  const { notifications } = createControllerMocks({
    certificates: [certificate],
  });
  const res = createResponse();

  await revokeCertificate(
    {
      params: { certificateId: certificate.certificateId },
      body: { revokedReason: "Correction needed" },
      user: { _id: organizerId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(certificate.status, "revoked");
  assert.equal(res.body.certificate.status, "revoked");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "event_certificate_revoked");
});

test("non-organizer cannot revoke certificate", async () => {
  const certificate = createCertificate();
  createControllerMocks({ certificates: [certificate] });
  const res = createResponse();

  await revokeCertificate(
    {
      params: { certificateId: certificate.certificateId },
      body: {},
      user: { _id: otherUserId },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "Only organizer can revoke certificates");
});
