import express from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import { prepareText, prepareYoutube, getSharedLibrary, saveProgress, getProgress } from "../controllers/dictation.controller.js";

const router = express.Router();

router.use(verifyToken);

router.get("/shared-library", getSharedLibrary);
router.post("/prepare-text", prepareText);
router.post("/prepare-youtube", prepareYoutube);

router.post("/progress/save", saveProgress);
router.get("/progress/:videoId", getProgress);

export default router;
