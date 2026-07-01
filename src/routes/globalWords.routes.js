import express from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import { getAllUserWords } from "../controllers/word.controller.js";

const router = express.Router();

router.use(verifyToken);

router.get("/", getAllUserWords);

export default router;
