import express from "express";
import User from "../models/User.js";
import Salon from "../models/Salon.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Debug: Get barber's salon data with populated salon info
router.get("/barber-salons/:barberId", protect, async (req, res) => {
  try {
    const barber = await User.findById(req.params.barberId)
      .select("-password")
      .populate({
        path: "salons.salon",
        select: "name city address phone imageUrl",
      });

    if (!barber) {
      return res.status(404).json({ message: "Barber not found" });
    }

    // Also fetch legacy salon if it exists
    let legacySalon = null;
    if (barber.salon) {
      legacySalon = await Salon.findById(barber.salon).select("name city");
    }

    return res.json({
      barberId: barber._id,
      barberName: barber.name,
      role: barber.role,
      salons: barber.salons || [],
      salonCount: (barber.salons || []).length,
      approvedCount: (barber.salons || []).filter((s) => s.status === "approved").length,
      legacySalon: legacySalon ? { _id: legacySalon._id, name: legacySalon.name } : null,
      legacySalonStatus: barber.salonStatus || "none",
      rawSalons: JSON.parse(JSON.stringify(barber.salons || [])),
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Debug route error",
    });
  }
});

// Debug: Get current user's full data from token
router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("-password")
      .populate({
        path: "salons.salon",
        select: "name city address phone imageUrl",
      });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      id: user._id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      salons: user.salons || [],
      salon: user.salon,
      salonStatus: user.salonStatus,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Debug route error",
    });
  }
});

export default router;
