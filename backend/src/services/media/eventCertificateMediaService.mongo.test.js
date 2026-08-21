import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import EventCertificate from "../../models/EventCertificate.js";
import MediaObject from "../../models/MediaObject.js";
import { attachEventCertificateMediaAtomically } from "./eventCertificateMediaService.js";

const enabled = process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true" && Boolean(process.env.MONGO_URI);
const connect = async () => {
  const uri = new URL(process.env.MONGO_URI);
  uri.pathname = `/event_certificate_media_${process.pid}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000 });
  await Promise.all([EventCertificate.deleteMany({}), MediaObject.deleteMany({})]);
  await Promise.all([EventCertificate.createIndexes(), MediaObject.createIndexes()]);
};
afterEach(async () => { if (mongoose.connection.readyState) await mongoose.disconnect().catch(() => {}); });

test("real Mongo activates a certificate object and binds it atomically", { skip: !enabled }, async () => {
  await connect();
  const certificate = await EventCertificate.create({
    eventId: new mongoose.Types.ObjectId(), registrationId: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(), organizerId: new mongoose.Types.ObjectId(),
    certificateId: "CERT-REAL-1", verificationCode: "VERIFY-REAL-1",
  });
  const mediaStore = { provider: "test", async stage() {}, async promote() {} };
  await attachEventCertificateMediaAtomically({
    certificateId: certificate._id,
    file: { filename: "certfile-real.pdf", originalname: "real.pdf", mimetype: "application/pdf", buffer: Buffer.from("pdf") },
    mediaStore,
  });
  const saved = await EventCertificate.findById(certificate._id).select("+mediaObjectId");
  const media = await MediaObject.findById(saved.mediaObjectId);
  assert.equal(media.status, "active");
  assert.equal(media.ownerModel, "EventCertificate");
});
