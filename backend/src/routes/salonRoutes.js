import express from "express";
import {
  createSalon,
  listManageableSalons,
  getMySalonStatus,
  getSalonProfile,
  listSalons,
} from "../controllers/salonController.js";
import {
  cancelJoinRequest,
  decideJoinRequest,
  getOwnerJoinRequests,
  leaveSalon,
  requestToJoinSalon,
} from "../controllers/salonMembershipController.js";
import {
  demoteAdmin,
  getSalonAdmins,
  getSalonStaff,
  promoteToAdmin,
  removeBarberFromSalon,
  updateMemberRelationshipType,
} from "../controllers/salonStaffController.js";
import { getDashboard } from "../controllers/salonDashboardController.js";
import { getCalendar } from "../controllers/salonCalendarController.js";
import { getPublicSalonBooking } from "../controllers/publicSalonBookingController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", listSalons);
router.get("/mine/manageable", protect, listManageableSalons);
router.get("/me/status", protect, getMySalonStatus);
router.get("/owner/requests", protect, getOwnerJoinRequests);
router.get("/:salonId/staff", protect, getSalonStaff);
router.get("/:salonId", getSalonProfile);
router.get("/:salonId/admins", protect, getSalonAdmins);
router.get("/:salonId/dashboard", protect, getDashboard);
router.get("/:salonId/calendar", protect, getCalendar);
router.get("/:salonId/public-booking", getPublicSalonBooking);

router.post("/", protect, createSalon);
router.patch("/leave", protect, leaveSalon);
router.patch("/:salonId/remove-barber/:barberId", protect, removeBarberFromSalon);
router.patch("/:salonId/promote-admin/:barberId", protect, promoteToAdmin);
router.patch("/:salonId/demote-admin/:barberId", protect, demoteAdmin);
router.patch(
  "/:salonId/members/:barberId/relationship-type",
  protect,
  updateMemberRelationshipType
);
router.post("/:salonId/join-requests", protect, requestToJoinSalon);
router.put("/join-requests/:requestId", protect, decideJoinRequest);
router.put("/join-requests/:requestId/cancel", protect, cancelJoinRequest);

export default router;
