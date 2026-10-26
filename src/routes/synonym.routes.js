import express from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import {
    importSynonyms,
    getClusters,
    getNextCluster,
    getCluster,
    saveProgress,
    getProgressOverview,
    getWordsByCluster,
    updateWord,
    deleteWord,
    deleteCluster,
} from "../controllers/synonym.controller.js";

const router = express.Router();

router.use(verifyToken);

// Import from Excel (bulk)
router.post("/import", importSynonyms);

// Clusters list
router.get("/clusters", getClusters);

// Smart next cluster for study
router.get("/next-cluster", getNextCluster);

// Specific cluster for study
router.get("/cluster/:clusterName", getCluster);

// Progress
router.post("/progress", saveProgress);
router.get("/progress", getProgressOverview);

// Word management
router.get("/cluster/:clusterName/words", getWordsByCluster);
router.put("/words/:wordId", updateWord);
router.delete("/words/:wordId", deleteWord);

// Delete entire cluster
router.delete("/cluster/:clusterName", deleteCluster);

export default router;
