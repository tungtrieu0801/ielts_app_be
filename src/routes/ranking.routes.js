import express from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import { getRanking } from "../controllers/ranking.controller.js";

const router = express.Router();

router.use(verifyToken);
router.get("/", getRanking);

export default router;
