import express from "express";
import { verifyToken, adminOnly } from "../middleware/auth.middleware.js";
import { getAdminDashboardData, getUserVideos, getAllSystemVideos, deleteSystemVideo, exportDatabase, importDatabase } from "../controllers/admin.controller.js";

const router = express.Router();

// Public health check — no auth required (for deployment verification)
router.get("/ping", (req, res) => res.json({ ok: true, version: "admin-v1", ts: new Date() }));

router.get("/dashboard", verifyToken, adminOnly, getAdminDashboardData);
router.get("/users/:userId/videos", verifyToken, adminOnly, getUserVideos);
router.get("/videos", verifyToken, adminOnly, getAllSystemVideos);
router.delete("/videos/:videoId", verifyToken, adminOnly, deleteSystemVideo);

// Backup / Restore routes
router.get("/backup/export", verifyToken, adminOnly, exportDatabase);
router.post("/backup/import", verifyToken, adminOnly, express.json({ limit: "100mb" }), importDatabase);

export default router;
