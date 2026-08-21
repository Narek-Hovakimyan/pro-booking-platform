import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import EventCertificate from "../../models/EventCertificate.js";
import MediaObject from "../../models/MediaObject.js";
import { serveEventCertificateMedia } from "./eventCertificateMediaController.js";

const original = { mediaFindOne: MediaObject.findOne, mediaExists: MediaObject.exists, certificateExists: EventCertificate.exists };
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

afterEach(() => {
  MediaObject.findOne = original.mediaFindOne;
  MediaObject.exists = original.mediaExists;
  EventCertificate.exists = original.certificateExists;
});

test("unbound, delete-pending, and traversal certificate URLs fail closed", async () => {
  MediaObject.findOne = () => ({ lean: async () => null });
  MediaObject.exists = async () => ({ _id: "pending" });
  EventCertificate.exists = async () => null;
  for (const filename of ["cert.pdf", "../cert.pdf"]) {
    const res = response();
    await serveEventCertificateMedia({ params: { filename } }, res);
    assert.equal(res.statusCode, 404);
  }
});
