import express from "express";
import {
  createSalon,
  listManageableSalons,
  getMySalonStatus,
  getSalonProfile,
  listSalons,
} from "../controllers/salons/salonController.js";
import {
  cancelJoinRequest,
  cancelJoinRequestBySalon,
  decideJoinRequest,
  getOwnerJoinRequests,
  leaveSalon,
  requestToJoinSalon,
} from "../controllers/salons/salonMembershipController.js";
import {
  demoteAdmin,
  getSalonAdmins,
  getSalonStaff,
  promoteToAdmin,
  removeBarberFromSalon,
  respondToRelationshipType,
  updateMemberRelationshipType,
  updateStaffPaymentSettings,
} from "../controllers/salons/salonStaffController.js";
import { getDashboard } from "../controllers/salons/salonDashboardController.js";
import {
  exportReports,
  getReports,
} from "../controllers/salons/salonReportController.js";
import { getCalendar } from "../controllers/schedules/salonCalendarController.js";
import { getPublicSalonBooking } from "../controllers/bookings/publicSalonBookingController.js";
import { updateStaffDepositSettingsBySalonOwner } from "../controllers/bookings/depositSettingsController.js";

import { optionalAuth, protect } from "../middleware/authMiddleware.js";
import { promoValidationLimiter } from "../middleware/rateLimitMiddleware.js";
import {
  getSalonPromotions,
  createSalonPromotion,
  updateSalonPromotion,
  validateSalonPromotion,
} from "../controllers/salonPromotionController.js";

const router = express.Router();

router.get("/", optionalAuth, listSalons);
router.get("/mine/manageable", protect, listManageableSalons);
router.get("/me/status", protect, getMySalonStatus);
router.get("/owner/requests", protect, getOwnerJoinRequests);
router.get("/:salonId/staff", protect, getSalonStaff);
router.get("/:salonId", getSalonProfile);
router.get("/:salonId/admins", protect, getSalonAdmins);
router.get("/:salonId/dashboard", protect, getDashboard);
router.get("/:salonId/calendar", protect, getCalendar);
router.get("/:salonId/public-booking", getPublicSalonBooking);
router.get("/:salonId/reports/export", protect, exportReports);
router.get("/:salonId/reports", protect, getReports);
router.get("/:salonId/promotions", protect, getSalonPromotions);
router.post("/:salonId/promotions", protect, createSalonPromotion);
router.post("/:salonId/promotions/validate", promoValidationLimiter, validateSalonPromotion);
router.patch("/:salonId/promotions/:promotionId", protect, updateSalonPromotion);

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
router.patch(
  "/:salonId/relationship-type/respond",
  protect,
  respondToRelationshipType
);
router.post("/:salonId/join-requests", protect, requestToJoinSalon);
router.put("/join-requests/by-salon/:salonId/cancel", protect, cancelJoinRequestBySalon);
router.put("/join-requests/:requestId", protect, decideJoinRequest);
router.put("/join-requests/:requestId/cancel", protect, cancelJoinRequest);

// Staff deposit settings (owner/admin only, not for chair_renters)
router.patch(
  "/:salonId/staff/:barberId/deposit-settings",
  protect,
  updateStaffDepositSettingsBySalonOwner
);
router.patch(
  "/:salonId/staff/:barberId/payment-settings",
  protect,
  updateStaffPaymentSettings
);

export default router;
