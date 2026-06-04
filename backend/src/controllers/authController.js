import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User, { MAX_PHONE_LENGTH } from "../models/User.js";
import { createTrialSubscription } from "../services/subscriptionService.js";

const getUserData = (user) => ({
  id: user._id,
  name: user.name,
  phone: user.phone,
  email: user.email || "",
  emailVerified: user.emailVerified || false,
  emailVerifiedAt: user.emailVerifiedAt || null,
  city: user.city || "",
  avatarUrl: user.avatarUrl || "",
  role: user.role,
  salon: user.salon || null,
  salonStatus: user.salonStatus || "none",
  salons: user.salons || [],
  profession: user.profession || "barber",
  barberType: user.barberType || "",
  specialty: user.specialty || "unisex",
  workHistory: user.workHistory || [],
  favoriteBarbers: user.favoriteBarbers || [],
  favoriteSalons: user.favoriteSalons || [],
  createdAt: user.createdAt,
});

const signToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

export const registerUser = async (req, res) => {
  try {
    const { name, password, role = "client" } = req.body;
    const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";

    if (!name || !phone || !password) {
      return res.status(400).json({ message: "Name, phone, and password are required" });
    }

    if (phone.length > MAX_PHONE_LENGTH) {
      return res.status(400).json({
        message: `Phone must be ${MAX_PHONE_LENGTH} characters or less`,
      });
    }

    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      });
    }

    if (!["client", "barber"].includes(role)) {
      return res.status(400).json({ message: "Role must be client or barber" });
    }

    const existingUser = await User.findOne({ phone });

    if (existingUser) {
      return res.status(400).json({ message: "Phone already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      phone,
      password: hashedPassword,
      role,
    });

    if (role === "barber") {
      try {
        await createTrialSubscription({
          ownerType: "barber",
          ownerId: user._id,
          payerId: user._id,
          seatCount: 1,
        });
      } catch (subscriptionError) {
        await User.findByIdAndDelete(user._id).catch(() => {});
        console.error("Registration trial creation failed:", subscriptionError);
        return res.status(500).json({ message: "Registration failed" });
      }
    }

    const token = signToken(user._id);

    return res.status(201).json({
      token,
      user: getUserData(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Phone already exists" });
    }

    console.error("Registration failed:", error);
    return res.status(500).json({ message: "Registration failed" });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { password } = req.body;
    const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";

    if (!phone || !password) {
      return res.status(400).json({ message: "Phone and password are required" });
    }

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(401).json({ message: "Invalid phone or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid phone or password" });
    }

    const token = signToken(user._id);

    return res.json({
      token,
      user: getUserData(user),
    });
  } catch (error) {
    console.error("Login failed:", error);
    return res.status(500).json({ message: "Login failed" });
  }
};
