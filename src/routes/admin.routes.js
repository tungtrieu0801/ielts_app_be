import express from "express";
import { verifyToken, adminOnly } from "../middleware/auth.middleware.js";
import { getAdminDashboardData } from "../controllers/admin.controller.js";

const router = express.Router();

// Public health check — no auth required (for deployment verification)
router.get("/ping", (req, res) => res.json({ ok: true, version: "admin-v1", ts: new Date() }));

router.get("/dashboard", verifyToken, adminOnly, getAdminDashboardData);

export default router;
