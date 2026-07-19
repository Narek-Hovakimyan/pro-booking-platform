import express from "express";

import {
  getCertificateById,
  revokeCertificate,
  verifyCertificate,
} from "../../controllers/events/certificateController.js";
import { protect } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/verify/:verificationCode", verifyCertificate);
router.get("/:certificateId", getCertificateById);
router.patch("/:certificateId/revoke", protect, revokeCertificate);

export default router;
