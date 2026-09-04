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
        const { limit = 10, levels = "" } = req.query;
        const limitNum = parseInt(limit, 10) || 10;

        // Find public sets matching selected levels if specified
        let setMatch = { isPublic: true };
        if (levels) {
            const levelArray = levels.split(",").map(l => l.trim().toUpperCase());
            const setTitles = levelArray.map(lvl => `CEFR ${lvl}`);
            setMatch.title = { $in: setTitles };
        }

        const publicSets = await WordSet.find(setMatch, "_id").lean();
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
        const { score, results, saveWords = true } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        let isNewHighScore = false;
        const currentHighScore = user.survivalHighScore || 0;
        if (score > currentHighScore) {
            user.survivalHighScore = score;
            await user.save();
            isNewHighScore = true;
        }

        // Process results to update UserCards (only if saveWords option is enabled)
        if (saveWords !== false && Array.isArray(results) && results.length > 0) {
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
        const topPlayers = await User.find({
            survivalHighScore: { $gt: 0 },
            email: { $ne: "system@ieltsapp.com" } // Exclude system/CEFR user
        })
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

        // Fetch top 10 mistakes directly from DB
        const wrongCards = await UserCard.find({ userId, gameWrongCount: { $gt: 0 } })
            .sort({ gameWrongCount: -1 })
            .limit(10)
            .populate("wordId", "english vietnamese pronunciation partOfSpeech")
            .lean();

        // Fetch top 10 mastered words directly from DB
        const masterCards = await UserCard.find({ userId, gameCorrectCount: { $gt: 0 } })
            .sort({ gameCorrectCount: -1 })
            .limit(10)
            .populate("wordId", "english vietnamese pronunciation partOfSpeech")
            .lean();

        // Total count of words played in survival
        const totalGameWords = await UserCard.countDocuments({
            userId,
            $or: [{ gameCorrectCount: { $gt: 0 } }, { gameWrongCount: { $gt: 0 } }]
        });

        const wrongWords = wrongCards
            .filter(c => c.wordId)
            .map(c => ({
                word: c.wordId.english,
                vietnamese: c.wordId.vietnamese,
                wrongCount: c.gameWrongCount,
                correctCount: c.gameCorrectCount
            }));

        const masterWords = masterCards
            .filter(c => c.wordId)
            .map(c => ({
                word: c.wordId.english,
                vietnamese: c.wordId.vietnamese,
                wrongCount: c.gameWrongCount,
                correctCount: c.gameCorrectCount
            }));

        res.json({
            data: {
                totalGameWords,
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

// Background seeding state tracker
const seedingState = { running: false, startedAt: null, log: [] };

async function runSeedingInBackground(systemUserId) {
    seedingState.running = true;
    seedingState.startedAt = new Date().toISOString();
    seedingState.log = [];

    try {
        // 1. Clear all old CEFR data owned by system user
        const oldSets = await WordSet.find({ userId: systemUserId }).lean();
        const oldSetIds = oldSets.map(s => s._id);
        if (oldSetIds.length > 0) {
            await Word.deleteMany({ setId: { $in: oldSetIds } });
            await WordSet.deleteMany({ userId: systemUserId });
        }
        seedingState.log.push(`Cleared ${oldSets.length} old sets and their words.`);

        // 2. Fetch Oxford 5000 vocabulary data
        const response = await fetch("https://raw.githubusercontent.com/winterdl/oxford-5000-vocabulary-audio-definition/main/data/oxford_5000.json");
        if (!response.ok) throw new Error(`Failed to fetch Oxford 5000 data: ${response.status}`);
        const json = await response.json();
        const items = Object.values(json);

        // Group items by CEFR level
        const grouped = { A1: [], A2: [], B1: [], B2: [], C1: [] };
        for (const item of items) {
            const lvl = (item.cefr || "").toUpperCase();
            if (grouped[lvl]) grouped[lvl].push(item);
        }

        // 3. Loop through each level and seed
        for (const [level, rawWords] of Object.entries(grouped)) {
            const setTitle = `CEFR ${level}`;
            const wordSet = await WordSet.create({
                title: setTitle,
                description: `Trọn bộ từ vựng Oxford cấp độ ${level} theo khung chuẩn châu Âu.`,
                userId: systemUserId,
                isPublic: true,
                color: LEVEL_COLORS[level] || "blue"
            });

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
                            await delay(80);
                        }
                    }
                } catch (err) {
                    translatedList = batchWords;
                }

                for (let j = 0; j < batch.length; j++) {
                    const item = batch[j];
                    wordsToInsert.push({
                        english: item.word,
                        vietnamese: translatedList[j] || item.word,
                        pronunciation: item.phon_br || item.phon_n_am || "",
                        partOfSpeech: item.type || "",
                        example: item.example || "",
                        exampleTranslation: "",
                        synonyms: [], antonyms: [], note: "",
                        setId: wordSet._id,
                        userId: systemUserId
                    });
                }
                await delay(150);
            }

            if (wordsToInsert.length > 0) {
                await Word.insertMany(wordsToInsert, { ordered: false });
                wordSet.wordCount = wordsToInsert.length;
                await wordSet.save();
            }
            seedingState.log.push(`Level ${level}: ${wordsToInsert.length} words seeded.`);
        }
    } catch (err) {
        seedingState.log.push(`ERROR: ${err.message}`);
        console.error("[SEED ERROR]", err);
    } finally {
        seedingState.running = false;
    }
}

export const triggerSeeding = async (req, res) => {
    if (seedingState.running) {
        return res.json({
            message: "Seeding is already running in the background!",
            startedAt: seedingState.startedAt,
            log: seedingState.log
        });
    }

    try {
        const systemUserId = await getOrCreateSystemUser();

        // Respond immediately so the request doesn't timeout
        res.json({
            message: "Seeding started in background! All old CEFR data will be cleared and re-seeded. This may take several minutes.",
            startedAt: new Date().toISOString()
        });

        // Run the heavy work in the background after response is sent
        runSeedingInBackground(systemUserId);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET /game/survival/seed-status - check seeding progress
export const getSeedingStatus = (req, res) => {
    res.json({
        running: seedingState.running,
        startedAt: seedingState.startedAt,
        log: seedingState.log
    });
};
