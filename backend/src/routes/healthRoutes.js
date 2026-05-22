import express from "express";

const router = express.Router();

router.get("/", (_req, res) => {
  res.send("API is running");
});

export default router;
