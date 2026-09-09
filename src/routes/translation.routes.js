import express from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import {
    createSession,
    getSessions,
    getSessionById,
    updateSession,
    deleteSession,
    lookupWord
} from "../controllers/translation.controller.js";

const router = express.Router();

// All translation routes require authentication
router.use(verifyToken);

router.get("/lookup-word", lookupWord);
router.post("/", createSession);
router.get("/", getSessions);
router.get("/:id", getSessionById);
router.put("/:id", updateSession);
router.delete("/:id", deleteSession);

export default router;
