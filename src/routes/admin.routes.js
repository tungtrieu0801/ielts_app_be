import express from "express";
import { verifyToken, adminOnly } from "../middleware/auth.middleware.js";
import { getAdminDashboardData } from "../controllers/admin.controller.js";

const router = express.Router();

router.get("/dashboard", verifyToken, adminOnly, getAdminDashboardData);

export default router;
