import express from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import { prepareText, prepareYoutube, getSharedLibrary } from "../controllers/dictation.controller.js";

const router = express.Router();

router.use(verifyToken);

router.get("/shared-library", getSharedLibrary);
router.post("/prepare-text", prepareText);
router.post("/prepare-youtube", prepareYoutube);

export default router;
