import express from "express";
import { loginUser, registerUser } from "../controllers/authController.js";
import { authLimiter } from "../middleware/rateLimitMiddleware.js";

const router = express.Router();

router.post("/register", authLimiter, registerUser);
router.post("/login", authLimiter, loginUser);

export default router;
