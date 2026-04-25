import express from "express";
import * as folderController from "../controllers/folder.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(verifyToken);

router.get("/", folderController.getFolders);
router.post("/", folderController.createFolder);
router.put("/:id", folderController.updateFolder);
router.delete("/:id", folderController.deleteFolder);

export default router;
