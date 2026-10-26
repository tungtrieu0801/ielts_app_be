import express from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import {
    importSynonyms, getClusters, getNextCluster, getCluster,
    saveProgress, getProgressOverview, getWordsByCluster,
    updateWord, deleteWord, deleteCluster,
} from "../controllers/synonym.controller.js";

const router = express.Router();
router.use(verifyToken);

router.post("/import", importSynonyms);
router.get("/clusters", getClusters);
router.get("/next-cluster", getNextCluster);

// SỬA Ở ĐÂY: Bỏ /:clusterName
router.get("/cluster", getCluster);
router.get("/cluster/words", getWordsByCluster);
router.delete("/cluster", deleteCluster);

router.post("/progress", saveProgress);
router.get("/progress", getProgressOverview);

router.put("/words/:wordId", updateWord);
router.delete("/words/:wordId", deleteWord);

export default router;