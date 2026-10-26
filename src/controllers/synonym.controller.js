// ═══════════════════════════════════════════════════════════════════
//  SYNONYM CONTROLLER
//  Import Excel, Learning Logic, Progress Tracking, CRUD
// ═══════════════════════════════════════════════════════════════════
import SynonymWord from "../models/SynonymWord.js";
import SynonymProgress from "../models/SynonymProgress.js";
import User from "../models/User.js";

// Helper: convert Google ID from JWT → MongoDB _id
const getUserMongoId = async (googleId) => {
    const user = await User.findOne({ googleId }).select("_id").lean();
    if (!user) throw new Error("User not found");
    return user._id;
};

// ─── IMPORT EXCEL (bulk create words) ──────────────────────────────
export const importSynonyms = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { words } = req.body;

        if (!words || !Array.isArray(words) || words.length === 0) {
            return res.status(400).json({ message: "Danh sách từ không hợp lệ." });
        }

        // Validate and sanitize
        const docs = words.map((w) => ({
            cluster: (w.cluster || "").trim(),
            word: (w.word || "").trim(),
            partOfSpeech: (w.partOfSpeech || "").trim(),
            bandLevel: (w.bandLevel || "").trim(),
            explanation: (w.explanation || "").trim(),
            exampleSentence: (w.exampleSentence || "").trim(),
            exampleTranslation: (w.exampleTranslation || "").trim(),
            userId,
        })).filter((d) => d.cluster && d.word);

        if (docs.length === 0) {
            return res.status(400).json({ message: "Không có từ hợp lệ để import." });
        }

        const result = await SynonymWord.insertMany(docs, { ordered: false });

        return res.json({
            message: `Đã import thành công ${result.length} từ.`,
            count: result.length,
        });
    } catch (err) {
        console.error("Import synonyms error:", err);
        return res.status(500).json({ message: "Lỗi khi import từ đồng nghĩa." });
    }
};

// ─── GET CLUSTERS LIST (with progress) ─────────────────────────────
export const getClusters = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { showAll, page = 1, limit = 20, search = "" } = req.query;

        const showAllUsers = showAll === "true";
        const matchFilter = showAllUsers ? {} : { userId };

        // If search, filter clusters by name
        if (search) {
            matchFilter.cluster = { $regex: search, $options: "i" };
        }

        // Get unique clusters with word counts
        const pipeline = [
            { $match: matchFilter },
            {
                $group: {
                    _id: "$cluster",
                    wordCount: { $sum: 1 },
                    bandLevels: { $addToSet: "$bandLevel" },
                    ownerIds: { $addToSet: "$userId" },
                },
            },
            { $sort: { _id: 1 } },
        ];

        const allClusters = await SynonymWord.aggregate(pipeline);
        const totalClusters = allClusters.length;

        // Manual pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const paginatedClusters = allClusters.slice(skip, skip + parseInt(limit));

        // Get progress for each cluster
        const clusterNames = paginatedClusters.map((c) => c._id);
        const progresses = await SynonymProgress.find({
            userId,
            cluster: { $in: clusterNames },
        });

        const progressMap = {};
        progresses.forEach((p) => {
            progressMap[p.cluster] = p;
        });

        const clusters = paginatedClusters.map((c) => ({
            cluster: c._id,
            wordCount: c.wordCount,
            bandLevels: c.bandLevels.filter(Boolean),
            isOwner: c.ownerIds.some((id) => id.toString() === userId.toString()),
            progress: progressMap[c._id] || null,
        }));

        return res.json({
            clusters,
            totalClusters,
            page: parseInt(page),
            totalPages: Math.ceil(totalClusters / parseInt(limit)),
        });
    } catch (err) {
        console.error("Get clusters error:", err);
        return res.status(500).json({ message: "Lỗi khi lấy danh sách cluster." });
    }
};

// ─── GET NEXT CLUSTER TO STUDY (smart sort) ─────────────────────────
export const getNextCluster = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { showAll } = req.query;
        const showAllUsers = showAll === "true";
        const matchFilter = showAllUsers ? {} : { userId };

        // Get all unique cluster names
        const allClusters = await SynonymWord.distinct("cluster", matchFilter);

        if (allClusters.length === 0) {
            return res.status(404).json({ message: "Chưa có cluster nào." });
        }

        // Get user's progress for these clusters
        const progresses = await SynonymProgress.find({
            userId,
            cluster: { $in: allClusters },
        }).lean();

        const progressMap = {};
        progresses.forEach((p) => {
            progressMap[p.cluster] = p;
        });

        // Sort clusters: 
        // 1. Never studied (no progress) → first
        // 2. Most wrong answers → second
        // 3. Oldest studied → third
        const sorted = allClusters.map((cluster) => {
            const p = progressMap[cluster];
            return {
                cluster,
                wrongCount: p ? p.wrongCount : 0,
                lastStudied: p ? p.lastStudied : null,
                hasProgress: !!p,
                mastery: p ? p.mastery : 0,
            };
        }).sort((a, b) => {
            // Never studied first
            if (!a.hasProgress && b.hasProgress) return -1;
            if (a.hasProgress && !b.hasProgress) return 1;

            // Both have progress: most wrong first
            if (a.wrongCount !== b.wrongCount) return b.wrongCount - a.wrongCount;

            // Same wrong count: oldest studied first
            if (a.lastStudied && b.lastStudied) {
                return new Date(a.lastStudied) - new Date(b.lastStudied);
            }
            return 0;
        });

        // Pick the first (most needed) cluster
        const targetCluster = sorted[0].cluster;

        // Get all words in that cluster
        const words = await SynonymWord.find({
            cluster: targetCluster,
            ...(showAllUsers ? {} : { userId }),
        }).lean();

        // Build quiz: for each word, create a fill-in-blank question from exampleSentence
        const questions = words.map((w) => {
            let blankedSentence = w.exampleSentence;
            // Replace the word in the sentence with a blank
            if (w.exampleSentence && w.word) {
                const regex = new RegExp(`\\b${escapeRegex(w.word)}\\b`, "gi");
                blankedSentence = w.exampleSentence.replace(regex, "________");
            }

            return {
                _id: w._id,
                word: w.word,
                partOfSpeech: w.partOfSpeech,
                bandLevel: w.bandLevel,
                blankedSentence,
                originalSentence: w.exampleSentence,
                explanation: w.explanation,
                exampleTranslation: w.exampleTranslation,
            };
        });

        // Shuffle questions for randomness
        const shuffled = shuffle(questions);

        // All words in this cluster (for answer options)
        const allWords = words.map((w) => w.word);

        return res.json({
            cluster: targetCluster,
            questions: shuffled,
            allWords: [...new Set(allWords)],
            progress: progressMap[targetCluster] || null,
            totalClustersRemaining: sorted.length,
        });
    } catch (err) {
        console.error("Get next cluster error:", err);
        return res.status(500).json({ message: "Lỗi khi lấy cluster tiếp theo." });
    }
};

// ─── GET SPECIFIC CLUSTER FOR STUDY ─────────────────────────────────
export const getCluster = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { clusterName } = req.params;
        const { showAll } = req.query;
        const showAllUsers = showAll === "true";
        const matchFilter = { cluster: clusterName };
        if (!showAllUsers) matchFilter.userId = userId;

        const words = await SynonymWord.find(matchFilter).lean();

        if (words.length === 0) {
            return res.status(404).json({ message: "Cluster không tồn tại." });
        }

        const questions = words.map((w) => {
            let blankedSentence = w.exampleSentence;
            if (w.exampleSentence && w.word) {
                const regex = new RegExp(`\\b${escapeRegex(w.word)}\\b`, "gi");
                blankedSentence = w.exampleSentence.replace(regex, "________");
            }

            return {
                _id: w._id,
                word: w.word,
                partOfSpeech: w.partOfSpeech,
                bandLevel: w.bandLevel,
                blankedSentence,
                originalSentence: w.exampleSentence,
                explanation: w.explanation,
                exampleTranslation: w.exampleTranslation,
            };
        });

        const allWords = [...new Set(words.map((w) => w.word))];
        const progress = await SynonymProgress.findOne({ userId, cluster: clusterName });

        return res.json({
            cluster: clusterName,
            questions: shuffle(questions),
            allWords,
            progress,
        });
    } catch (err) {
        console.error("Get cluster error:", err);
        return res.status(500).json({ message: "Lỗi khi lấy cluster." });
    }
};

// ─── SAVE PROGRESS (after completing a cluster quiz) ────────────────
export const saveProgress = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { cluster, correctCount, wrongCount } = req.body;

        if (!cluster) {
            return res.status(400).json({ message: "Cluster name is required." });
        }

        const totalAttempted = (correctCount || 0) + (wrongCount || 0);
        const accuracy = totalAttempted > 0 ? (correctCount || 0) / totalAttempted : 0;

        // Calculate mastery: 0=new, 1=learning, 2=familiar, 3=mastered
        let masteryDelta = 0;
        if (accuracy >= 0.9) masteryDelta = 1;
        else if (accuracy < 0.5) masteryDelta = -1;

        const progress = await SynonymProgress.findOneAndUpdate(
            { userId, cluster },
            {
                $inc: {
                    totalAttempts: 1,
                    correctCount: correctCount || 0,
                    wrongCount: wrongCount || 0,
                },
                $set: {
                    lastStudied: new Date(),
                },
            },
            { upsert: true, new: true }
        );

        // Update mastery level (clamp between 0-3)
        const newMastery = Math.max(0, Math.min(3, progress.mastery + masteryDelta));
        if (newMastery !== progress.mastery) {
            progress.mastery = newMastery;
            await progress.save();
        }

        return res.json({
            message: "Đã lưu tiến trình học.",
            progress,
        });
    } catch (err) {
        console.error("Save progress error:", err);
        return res.status(500).json({ message: "Lỗi khi lưu tiến trình." });
    }
};

// ─── GET USER PROGRESS OVERVIEW ──────────────────────────────────────
export const getProgressOverview = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);

        const progresses = await SynonymProgress.find({ userId })
            .sort({ wrongCount: -1, lastStudied: 1 })
            .lean();

        const totalClusters = await SynonymWord.distinct("cluster", { userId });

        return res.json({
            progresses,
            totalClustersAvailable: totalClusters.length,
            totalStudied: progresses.length,
            totalMastered: progresses.filter((p) => p.mastery >= 3).length,
        });
    } catch (err) {
        console.error("Get progress overview error:", err);
        return res.status(500).json({ message: "Lỗi khi lấy tiến trình." });
    }
};

// ─── MANAGE: Get words by cluster (own words only, paginated) ────────
export const getWordsByCluster = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { clusterName } = req.params;
        const { page = 1, limit = 20 } = req.query;

        const filter = { userId, cluster: clusterName };
        const total = await SynonymWord.countDocuments(filter);
        const words = await SynonymWord.find(filter)
            .sort({ createdAt: 1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit))
            .lean();

        return res.json({
            words,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
        });
    } catch (err) {
        console.error("Get words by cluster error:", err);
        return res.status(500).json({ message: "Lỗi khi lấy từ." });
    }
};

// ─── UPDATE A WORD ───────────────────────────────────────────────────
export const updateWord = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { wordId } = req.params;
        const updateData = req.body;

        const word = await SynonymWord.findOne({ _id: wordId, userId });
        if (!word) {
            return res.status(404).json({ message: "Không tìm thấy từ hoặc không có quyền sửa." });
        }

        // Allowed fields to update
        const allowed = ["word", "partOfSpeech", "bandLevel", "explanation", "exampleSentence", "exampleTranslation", "cluster"];
        allowed.forEach((field) => {
            if (updateData[field] !== undefined) {
                word[field] = updateData[field];
            }
        });

        await word.save();

        return res.json({ message: "Đã cập nhật từ.", word });
    } catch (err) {
        console.error("Update word error:", err);
        return res.status(500).json({ message: "Lỗi khi cập nhật từ." });
    }
};

// ─── DELETE A WORD ───────────────────────────────────────────────────
export const deleteWord = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { wordId } = req.params;

        const word = await SynonymWord.findOneAndDelete({ _id: wordId, userId });
        if (!word) {
            return res.status(404).json({ message: "Không tìm thấy từ hoặc không có quyền xóa." });
        }

        return res.json({ message: "Đã xóa từ." });
    } catch (err) {
        console.error("Delete word error:", err);
        return res.status(500).json({ message: "Lỗi khi xóa từ." });
    }
};

// ─── DELETE ENTIRE CLUSTER ───────────────────────────────────────────
export const deleteCluster = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { clusterName } = req.params;

        const result = await SynonymWord.deleteMany({ cluster: clusterName, userId });
        await SynonymProgress.deleteOne({ userId, cluster: clusterName });

        return res.json({
            message: `Đã xóa cluster "${clusterName}" (${result.deletedCount} từ).`,
            deletedCount: result.deletedCount,
        });
    } catch (err) {
        console.error("Delete cluster error:", err);
        return res.status(500).json({ message: "Lỗi khi xóa cluster." });
    }
};

// ─── Helpers ─────────────────────────────────────────────────────────
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
