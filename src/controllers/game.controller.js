import mongoose from "mongoose";
import User from "../models/User.js";
import UserCard from "../models/UserCard.js";
import Word from "../models/Word.js";
import WordSet from "../models/WordSet.js";
import { translate } from "google-translate-api-x";

const getUserMongoId = async (googleId) => {
    const user = await User.findOne({ googleId }).select("_id").lean();
    if (!user) throw new Error("User not found");
    return user._id;
};

// GET /game/survival/questions
export const getSurvivalQuestions = async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const limitNum = parseInt(limit, 10) || 10;

        // Find public sets (which include our seeded A1-C1 sets)
        const publicSets = await WordSet.find({ isPublic: true }, "_id").lean();
        const publicSetIds = publicSets.map(s => s._id);

        if (publicSetIds.length === 0) {
            return res.status(400).json({ message: "No public vocabulary sets available." });
        }

        // Get random target words
        const targetWords = await Word.aggregate([
            { $match: { setId: { $in: publicSetIds } } },
            { $sample: { size: limitNum } }
        ]);

        if (targetWords.length === 0) {
            return res.status(400).json({ message: "No words found in public sets." });
        }

        // Fetch some random distractors for multiple choices
        const distractorCount = Math.min(200, limitNum * 5); // limit distractor sample size
        const distractors = await Word.aggregate([
            { $match: { setId: { $in: publicSetIds } } },
            { $sample: { size: distractorCount } }
        ]);

        const distractorMeanings = Array.from(new Set(distractors.map(d => d.vietnamese).filter(Boolean)));

        const questions = targetWords.map((word, idx) => {
            const correctMean = word.vietnamese;
            // Filter out the correct meaning and select 3 random meanings
            let chosenDistractors = distractorMeanings
                .filter(m => m !== correctMean)
                .sort(() => Math.random() - 0.5)
                .slice(0, 3);

            // Fallback in case we don't have enough distractors
            while (chosenDistractors.length < 3) {
                chosenDistractors.push(`Nghĩa nhiễu ngẫu nhiên ${chosenDistractors.length + 1}`);
            }

            // Shuffle the options
            const options = [correctMean, ...chosenDistractors].sort(() => Math.random() - 0.5);

            return {
                wordId: word._id,
                english: word.english,
                pronunciation: word.pronunciation,
                partOfSpeech: word.partOfSpeech,
                correctAnswer: correctMean,
                options,
                example: word.example,
                exampleTranslation: word.exampleTranslation
            };
        });

        res.json({ data: questions });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// POST /game/survival/score
export const submitSurvivalScore = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { score, results } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        let isNewHighScore = false;
        const currentHighScore = user.survivalHighScore || 0;
        if (score > currentHighScore) {
            user.survivalHighScore = score;
            await user.save();
            isNewHighScore = true;
        }

        // Process results to update UserCards
        if (Array.isArray(results) && results.length > 0) {
            const bulkOps = results.map(item => {
                const isCorrect = !!item.correct;
                return {
                    updateOne: {
                        filter: { userId, wordId: new mongoose.Types.ObjectId(item.wordId) },
                        update: {
                            $setOnInsert: {
                                userId,
                                wordId: new mongoose.Types.ObjectId(item.wordId),
                                status: "NEW",
                                level: 0,
                                easeFactor: 2.5,
                                interval: 0,
                                repetition: 0,
                                lastReviewed: null,
                                nextReview: null,
                            },
                            $inc: {
                                gameCorrectCount: isCorrect ? 1 : 0,
                                gameWrongCount: isCorrect ? 0 : 1,
                            }
                        },
                        upsert: true
                    }
                };
            });

            await UserCard.bulkWrite(bulkOps);
        }

        res.json({
            message: "Score submitted successfully",
            highScore: user.survivalHighScore,
            isNewHighScore
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET /game/survival/leaderboard
export const getSurvivalLeaderboard = async (req, res) => {
    try {
        const topPlayers = await User.find({ survivalHighScore: { $gt: 0 } })
            .sort({ survivalHighScore: -1 })
            .limit(50)
            .select("name picture email survivalHighScore")
            .lean();

        const formatted = topPlayers.map((p, index) => ({
            rank: index + 1,
            userId: p._id,
            name: p.name,
            picture: p.picture,
            email: p.email,
            score: p.survivalHighScore
        }));

        res.json({ data: formatted });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET /game/survival/stats
export const getSurvivalStats = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);

        const stats = await UserCard.find({
            userId,
            $or: [{ gameCorrectCount: { $gt: 0 } }, { gameWrongCount: { $gt: 0 } }]
        })
        .populate("wordId", "english vietnamese pronunciation partOfSpeech")
        .lean();

        const validStats = stats.filter(c => c.wordId);

        // Sort by wrong count descending (top mistakes)
        const wrongWords = [...validStats]
            .filter(c => c.gameWrongCount > 0)
            .sort((a, b) => b.gameWrongCount - a.gameWrongCount)
            .slice(0, 10)
            .map(c => ({
                word: c.wordId.english,
                vietnamese: c.wordId.vietnamese,
                wrongCount: c.gameWrongCount,
                correctCount: c.gameCorrectCount
            }));

        // Sort by correct count descending (top mastered)
        const masterWords = [...validStats]
            .filter(c => c.gameCorrectCount > 0)
            .sort((a, b) => b.gameCorrectCount - a.gameCorrectCount)
            .slice(0, 10)
            .map(c => ({
                word: c.wordId.english,
                vietnamese: c.wordId.vietnamese,
                wrongCount: c.gameWrongCount,
                correctCount: c.gameCorrectCount
            }));

        res.json({
            data: {
                totalGameWords: validStats.length,
                wrongWords,
                masterWords
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ════════ SEED CEFR VOCABULARY API ════════
const LEVEL_COLORS = {
    A1: "green",
    A2: "teal",
    B1: "blue",
    B2: "orange",
    C1: "red"
};
const BATCH_SIZE = 120;
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getOrCreateSystemUser() {
    let user = await User.findOne({ email: "system@ieltsapp.com" });
    if (!user) {
        user = await User.create({
            googleId: "system_library_id_cefr",
            email: "system@ieltsapp.com",
            name: "Hệ thống CEFR",
            picture: "",
            role: "admin",
            isActive: true
        });
    }
    return user._id;
}

export const triggerSeeding = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const user = await User.findById(userId);
        if (!user || user.role !== "admin") {
            return res.status(403).json({ message: "Admin access required" });
        }

        const systemUserId = await getOrCreateSystemUser();

        // 1. Fetch Oxford 5000 vocabulary data
        const response = await fetch("https://raw.githubusercontent.com/winterdl/oxford-5000-vocabulary-audio-definition/main/data/oxford_5000.json");
        if (!response.ok) {
            throw new Error(`Failed to fetch Oxford 5000 data: ${response.status}`);
        }
        const json = await response.json();
        const items = Object.values(json);

        // Group items by CEFR level
        const grouped = { A1: [], A2: [], B1: [], B2: [], C1: [] };
        for (const item of items) {
            const lvl = (item.cefr || "").toUpperCase();
            if (grouped[lvl]) {
                grouped[lvl].push(item);
            }
        }

        const seededSummary = [];

        // 2. Loop through each level and seed
        for (const [level, rawWords] of Object.entries(grouped)) {
            const setTitle = `CEFR ${level}`;
            let wordSet = await WordSet.findOne({ title: setTitle, userId: systemUserId });
            if (!wordSet) {
                wordSet = await WordSet.create({
                    title: setTitle,
                    description: `Trọn bộ từ vựng Oxford cấp độ ${level} theo khung chuẩn châu Âu.`,
                    userId: systemUserId,
                    isPublic: true,
                    color: LEVEL_COLORS[level] || "blue"
                });
            }

            const existingCount = await Word.countDocuments({ setId: wordSet._id });
            if (existingCount > 0) {
                seededSummary.push({ level, count: existingCount, status: "Already seeded previously" });
                continue;
            }

            const wordsToInsert = [];
            for (let i = 0; i < rawWords.length; i += BATCH_SIZE) {
                const batch = rawWords.slice(i, i + BATCH_SIZE);
                const batchWords = batch.map(w => w.word);

                let translatedList = [];
                try {
                    const textToTranslate = batchWords.join(" | ");
                    const transRes = await translate(textToTranslate, { to: "vi" });
                    translatedList = transRes.text.split(" | ").map(t => t.trim());

                    if (translatedList.length !== batch.length) {
                        translatedList = [];
                        for (const w of batchWords) {
                            const singleRes = await translate(w, { to: "vi" });
                            translatedList.push(singleRes.text.trim());
                            await delay(100);
                        }
                    }
                } catch (err) {
                    translatedList = batchWords;
                }

                for (let j = 0; j < batch.length; j++) {
                    const item = batch[j];
                    const viMeaning = translatedList[j] || item.word;

                    wordsToInsert.push({
                        english: item.word,
                        vietnamese: viMeaning,
                        pronunciation: item.phon_br || item.phon_n_am || "",
                        partOfSpeech: item.type || "",
                        example: item.example || "",
                        exampleTranslation: "",
                        synonyms: [],
                        antonyms: [],
                        note: "",
                        setId: wordSet._id,
                        userId: systemUserId
                    });
                }
                // Short politeness delay
                await delay(200);
            }

            if (wordsToInsert.length > 0) {
                await Word.insertMany(wordsToInsert);
                wordSet.wordCount = wordsToInsert.length;
                await wordSet.save();
                seededSummary.push({ level, count: wordsToInsert.length, status: "Seeded successfully" });
            } else {
                seededSummary.push({ level, count: 0, status: "No words to insert" });
            }
        }

        res.json({
            message: "CEFR vocabulary seeded successfully!",
            summary: seededSummary
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
