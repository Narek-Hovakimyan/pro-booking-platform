import express from "express";
import { loginUser, registerUser } from "../controllers/authController.js";
import {
  loginRateLimiter,
  registerRateLimiter,
} from "../middleware/rateLimitMiddleware.js";

const router = express.Router();

router.post("/register", registerRateLimiter, registerUser);
router.post("/login", loginRateLimiter, loginUser);

export default router;
