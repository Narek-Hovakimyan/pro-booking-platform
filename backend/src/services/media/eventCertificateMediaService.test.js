import assert from "node:assert/strict";
import test from "node:test";

import {
  attachEventCertificateMediaAtomically,
  EVENT_CERTIFICATE_MEDIA_CLASS,
  eventCertificateMediaUrl,
} from "./eventCertificateMediaService.js";

const file = { filename: "certfile-a.pdf", originalname: "certificate.pdf", mimetype: "application/pdf", buffer: Buffer.from("pdf") };
const mediaStore = { provider: "test", async stage() {}, async promote() {} };
const session = { async withTransaction(task) { await task(); }, async endSession() {} };

test("event certificate upload binds one active owned media object transactionally", async () => {
  const rows = [];
  const MediaObjectModel = {
    async create(value) { const media = { ...value, _id: "media-1" }; rows.push(media); return media; },
    async findOneAndUpdate(filter, update) {
      const media = rows.find((row) => row._id === filter._id && row.status === filter.status);
      if (!media) return null;
      Object.assign(media, update.$set); return { ...media };
    },
    async updateOne() {},
  };
  const EventCertificateModel = {
    async findOneAndUpdate(_filter, update) { return { _id: "certificate-1", ...update.$set }; },
  };
  const certificate = await attachEventCertificateMediaAtomically({
    certificateId: "certificate-1", file, EventCertificateModel, MediaObjectModel,
    mediaStore, startSession: async () => session,
  });
  assert.equal(certificate.fileUrl, eventCertificateMediaUrl(file.filename));
  assert.equal(rows[0].ownerModel, "EventCertificate");
  assert.equal(rows[0].mediaClass, EVENT_CERTIFICATE_MEDIA_CLASS);
  assert.equal(rows[0].status, "active");
});

test("certificate media URL preserves the existing public route shape", () => {
  assert.equal(eventCertificateMediaUrl("certfile-a.pdf"), "/uploads/certificate-files/certfile-a.pdf");
});
