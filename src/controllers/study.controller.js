import Word from "../models/Word.js";
import WordSet from "../models/WordSet.js";
import UserCard from "../models/UserCard.js";
import User from "../models/User.js";
import StudyLog from "../models/StudyLog.js";
import { calculateSRS } from "../utils/srs.js";

const SESSION_LIMIT = 20; // max cards per session

// ─── helpers ────────────────────────────────────────────────────────────────

const getUserMongoId = async (googleId) => {
    const user = await User.findOne({ googleId }).select("_id").lean();
    if (!user) throw new Error("User not found");
    return user._id;
};

const toUTCDay = (date = new Date()) => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
};

/**
 * Ensure every word in a set has a UserCard row.
 * Called lazily when the session starts — only inserts rows that don't exist yet.
 */
const ensureUserCards = async (userId, wordIds) => {
    const existing = await UserCard.find({
        userId,
        wordId: { $in: wordIds },
    }).select("wordId").lean();

    const existingSet = new Set(existing.map((c) => c.wordId.toString()));
    const toInsert = wordIds
        .filter((id) => !existingSet.has(id.toString()))
        .map((wordId) => ({
            userId,
            wordId,
            status: "NEW",
            level: 0,
            easeFactor: 2.5,
            interval: 0,
            repetition: 0,
            lastReviewed: null,
            nextReview: null,
        }));

    if (toInsert.length > 0) {
        await UserCard.insertMany(toInsert, { ordered: false }).catch(() => {
            // ignore duplicate key errors from race conditions
        });
    }
};

// ─── GET /study/global-session ───────────────────────────────────────────────
export const getGlobalStudySession = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const now = new Date();

        // 1. Fetch ALL due cards across all sets
        const dueCards = await UserCard.find({
            userId,
            status: { $in: ["LEARNING", "REVIEW"] },
            nextReview: { $lte: now },
        })
            .sort({ nextReview: 1 })
            .limit(SESSION_LIMIT)
            .lean();

        let sessionCards = [...dueCards];

        // 2. If slots left, fetch NEW cards across all sets
        const remaining = SESSION_LIMIT - sessionCards.length;
        if (remaining > 0) {
            const newCards = await UserCard.find({
                userId,
                status: "NEW",
            })
                .sort({ createdAt: 1 })
                .limit(remaining)
                .lean();
            sessionCards = [...sessionCards, ...newCards];
        }

        // 3. If still empty, check for unactivated words
        if (sessionCards.length === 0) {
            const allWords = await Word.find({ userId }).select("_id").limit(SESSION_LIMIT).lean();
            const wordIds = allWords.map(w => w._id);
            await ensureUserCards(userId, wordIds);

            sessionCards = await UserCard.find({
                userId,
                wordId: { $in: wordIds },
                status: "NEW"
            }).limit(SESSION_LIMIT).lean();
        }

        if (sessionCards.length === 0) {
            return res.json({ data: [], mode: "all_done", nextReviewAt: null, total: 0 });
        }

        // Join word data
        const wordIds = sessionCards.map(c => c.wordId);
        const words = await Word.find({ _id: { $in: wordIds } }).lean();
        const wordMap = Object.fromEntries(words.map(w => [w._id.toString(), w]));

        const result = sessionCards.map((card) => {
            const word = wordMap[card.wordId.toString()];
            return {
                ...word,
                cardId: card._id,
                srs: {
                    status: card.status,
                    level: card.level,
                    interval: card.interval,
                    nextReview: card.nextReview,
                },
            };
        });

        res.json({
            data: result,
            mode: dueCards.length > 0 ? "srs_review" : "new_words",
            total: result.length,
            isGlobal: true
        });
    } catch (err) {
        console.error("[study] getGlobalStudySession error:", err);
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /study/:setId/session ───────────────────────────────────────────────

export const getStudySession = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { setId } = req.params;

        // Verify set ownership
        const set = await WordSet.findOne({ _id: setId, userId }).lean();
        if (!set) return res.status(404).json({ message: "Word set not found" });

        // Fetch all word IDs in this set
        const words = await Word.find({ setId, userId }).lean();
        if (words.length === 0) {
            return res.json({ data: [], mode: "empty", total: 0 });
        }

        const wordIds = words.map((w) => w._id);
        const wordMap = Object.fromEntries(words.map((w) => [w._id.toString(), w]));

        // Ensure UserCard rows exist for all words
        await ensureUserCards(userId, wordIds);

        const now = new Date();

        // 1. Due cards (nextReview <= now)
        const dueCards = await UserCard.find({
            userId,
            wordId: { $in: wordIds },
            status: { $in: ["LEARNING", "REVIEW"] },
            nextReview: { $lte: now },
        })
            .sort({ nextReview: 1 })
            .limit(SESSION_LIMIT)
            .lean();

        let sessionCards = [...dueCards];

        // 2. Fill remaining slots with NEW cards (up to SESSION_LIMIT)
        const remaining = SESSION_LIMIT - sessionCards.length;
        if (remaining > 0) {
            const newCards = await UserCard.find({
                userId,
                wordId: { $in: wordIds },
                status: "NEW",
            })
                .sort({ createdAt: 1 })
                .limit(remaining)   // fill the full remaining quota
                .lean();
            sessionCards = [...sessionCards, ...newCards];
        }

        if (sessionCards.length === 0) {
            // All cards are scheduled for future — show earliest upcoming
            const nextCard = await UserCard.findOne({
                userId,
                wordId: { $in: wordIds },
            })
                .sort({ nextReview: 1 })
                .lean();

            return res.json({
                data: [],
                mode: "all_done",
                nextReviewAt: nextCard?.nextReview ?? null,
                total: 0,
            });
        }

        // Join word vocabulary data
        const result = sessionCards.map((card) => {
            const word = wordMap[card.wordId.toString()];
            return {
                ...word,
                _id: word._id, // keep the word _id for display
                cardId: card._id, // UserCard _id — used for submit
                srs: {
                    status: card.status,
                    level: card.level,
                    interval: card.interval,
                    nextReview: card.nextReview,
                },
            };
        });

        res.json({
            data: result,
            mode: dueCards.length > 0 ? "srs_review" : "new_words",
            total: result.length,
        });
    } catch (err) {
        console.error("[study] getStudySession error:", err);
        res.status(500).json({ message: err.message });
    }
};

// ─── POST /study/batch-submit ────────────────────────────────────────────────
/**
 * Body: { answers: [{ cardId, quality }] }
 * quality: "AGAIN" | "HARD" | "GOOD" | "EASY"
 *
 * Processes all answers in one shot, updates UserCards, logs study activity.
 */
export const batchSubmit = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { answers } = req.body;

        if (!Array.isArray(answers) || answers.length === 0) {
            return res.status(400).json({ message: "answers array is required" });
        }

        const VALID_QUALITIES = ["AGAIN", "HARD", "GOOD", "EASY"];
        const invalid = answers.find(
            (a) => !a.cardId || !VALID_QUALITIES.includes(a.quality)
        );
        if (invalid) {
            return res.status(400).json({
                message: `Invalid answer entry: ${JSON.stringify(invalid)}`,
            });
        }

        const cardIds = answers.map((a) => a.cardId);

        // Fetch all cards at once and verify ownership
        const cards = await UserCard.find({
            _id: { $in: cardIds },
            userId,
        }).lean();

        if (cards.length !== answers.length) {
            return res.status(400).json({
                message: `Some cards were not found or do not belong to this user`,
            });
        }

        const cardMap = Object.fromEntries(cards.map((c) => [c._id.toString(), c]));

        // Calculate new SRS state for each card
        const bulkOps = answers.map(({ cardId, quality }) => {
            const card = cardMap[cardId];
            const newState = calculateSRS(card, quality);
            return {
                updateOne: {
                    filter: { _id: cardId },
                    update: { $set: newState },
                },
            };
        });

        await UserCard.bulkWrite(bulkOps);

        // Build result summary per quality
        const summary = { AGAIN: 0, HARD: 0, GOOD: 0, EASY: 0 };
        answers.forEach(({ quality }) => { summary[quality] = (summary[quality] || 0) + 1; });

        // Upsert StudyLog for today
        const today = toUTCDay();
        await StudyLog.findOneAndUpdate(
            { userId, date: today },
            {
                $inc: {
                    wordsReviewed: answers.length,
                    minutesStudied: answers.length * 0.5,
                },
                $setOnInsert: { userId, date: today },
            },
            { upsert: true }
        );

        // --- Recalculate Streak for Ranking ---
        const oneYearAgo = new Date(today);
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const logs = await StudyLog.find({
            userId,
            date: { $gte: oneYearAgo },
            wordsReviewed: { $gt: 0 },
        }).select("date").sort({ date: -1 }).lean();

        let currentStreak = 0;
        let longestStreak = 0;

        if (logs.length > 0) {
            const daySet = new Set(logs.map(l => l.date.toISOString().split("T")[0]));
            const todayStr = today.toISOString().split("T")[0];
            const yesterdayDate = new Date(today);
            yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
            const yesterdayStr = yesterdayDate.toISOString().split("T")[0];

            const startFromToday = daySet.has(todayStr);
            const startFromYesterday = !startFromToday && daySet.has(yesterdayStr);

            if (startFromToday || startFromYesterday) {
                const checkDate = new Date(startFromToday ? today : yesterdayDate);
                while (true) {
                    const checkStr = checkDate.toISOString().split("T")[0];
                    if (daySet.has(checkStr)) {
                        currentStreak++;
                        checkDate.setUTCDate(checkDate.getUTCDate() - 1);
                    } else break;
                }
            }

            // Longest streak
            const sortedDays = [...daySet].sort();
            let tempStreak = 1;
            longestStreak = 1;
            for (let i = 1; i < sortedDays.length; i++) {
                const diff = (new Date(sortedDays[i]) - new Date(sortedDays[i - 1])) / 86400000;
                if (diff === 1) {
                    tempStreak++;
                    longestStreak = Math.max(longestStreak, tempStreak);
                } else {
                    tempStreak = 1;
                }
            }
        }

        // Update User model
        await User.findByIdAndUpdate(userId, { currentStreak, longestStreak });
        // --- End Recalculate Streak ---

        res.json({
            success: true,
            reviewed: answers.length,
            summary,
        });
    } catch (err) {
        console.error("[study] batchSubmit error:", err);
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /study/stats ────────────────────────────────────────────────────────
export const getStudyStats = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const now = new Date();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [totalWords, totalSets, totalUserCards, dueCards, newCards, masteredCards, reviewedToday] =
            await Promise.all([
                Word.countDocuments({ userId }),
                WordSet.countDocuments({ userId }),
                UserCard.countDocuments({ userId }),
                UserCard.countDocuments({
                    userId,
                    status: { $in: ["LEARNING", "REVIEW"] },
                    nextReview: { $lte: now },
                }),
                UserCard.countDocuments({ userId, status: "NEW" }),
                UserCard.countDocuments({ userId, level: 5 }),
                UserCard.countDocuments({
                    userId,
                    lastReviewed: { $gte: todayStart },
                }),
            ]);

        // Words that haven't been "activated" (don't have a UserCard yet) are also NEW
        const unactivatedCount = Math.max(0, totalWords - totalUserCards);
        const actualDueCards = dueCards + unactivatedCount;

        res.json({
            data: {
                totalWords,
                totalSets,
                dueCards: actualDueCards,
                newCards: newCards + unactivatedCount,
                masteredCards,
                reviewedToday,
            },
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /study/heatmap ──────────────────────────────────────────────────────
export const getStreakHeatmap = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const today = toUTCDay();
        const oneYearAgo = new Date(today);
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const logs = await StudyLog.find({
            userId,
            date: { $gte: oneYearAgo, $lte: today },
        })
            .select("date wordsReviewed minutesStudied -_id")
            .sort({ date: 1 })
            .lean();

        const data = logs.map((log) => ({
            date: log.date.toISOString().split("T")[0],
            wordsReviewed: log.wordsReviewed,
            minutesStudied: Math.round(log.minutesStudied),
        }));

        res.json({ data });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /study/streak ───────────────────────────────────────────────────────
export const getStreakInfo = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const today = toUTCDay();
        const oneYearAgo = new Date(today);
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const logs = await StudyLog.find({
            userId,
            date: { $gte: oneYearAgo },
            wordsReviewed: { $gt: 0 },
        })
            .select("date -_id")
            .sort({ date: -1 })
            .lean();

        if (logs.length === 0) {
            await User.findByIdAndUpdate(userId, { currentStreak: 0, longestStreak: 0 });
            return res.json({ data: { currentStreak: 0, longestStreak: 0, totalStudyDays: 0 } });
        }

        const daySet = new Set(logs.map((l) => l.date.toISOString().split("T")[0]));
        const todayStr = today.toISOString().split("T")[0];
        const yesterdayDate = new Date(today);
        yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
        const yesterdayStr = yesterdayDate.toISOString().split("T")[0];

        let currentStreak = 0;
        const startFromToday = daySet.has(todayStr);
        const startFromYesterday = !startFromToday && daySet.has(yesterdayStr);

        if (startFromToday || startFromYesterday) {
            const checkDate = new Date(startFromToday ? today : yesterdayDate);
            while (true) {
                const checkStr = checkDate.toISOString().split("T")[0];
                if (daySet.has(checkStr)) {
                    currentStreak++;
                    checkDate.setUTCDate(checkDate.getUTCDate() - 1);
                } else break;
            }
        }

        const sortedDays = [...daySet].sort();
        let longestStreak = 1, tempStreak = 1;
        for (let i = 1; i < sortedDays.length; i++) {
            const diff = (new Date(sortedDays[i]) - new Date(sortedDays[i - 1])) / 86400000;
            if (diff === 1) {
                tempStreak++;
                longestStreak = Math.max(longestStreak, tempStreak);
            } else {
                tempStreak = 1;
            }
        }

        await User.findByIdAndUpdate(userId, { currentStreak, longestStreak });

        res.json({ data: { currentStreak, longestStreak, totalStudyDays: daySet.size } });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /study/schedule ─────────────────────────────────────────────────────
/**
 * Returns a full SRS schedule overview across ALL user cards:
 *   - availableNow: cards with nextReview <= now OR status NEW
 *   - nextReviewAt: earliest upcoming nextReview date
 *   - minutesUntilNext: minutes until next card
 *   - timeline: upcoming buckets [{ label, count, nextReviewAt }]
 */
export const getStudySchedule = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const now = new Date();

        // 1. Cards available right now (NEW + DUE)
        const [availableCardsCount, totalWords, totalUserCards] = await Promise.all([
            UserCard.countDocuments({
                userId,
                $or: [
                    { status: "NEW" },
                    { status: { $in: ["LEARNING", "REVIEW"] }, nextReview: { $lte: now } },
                ],
            }),
            Word.countDocuments({ userId }),
            UserCard.countDocuments({ userId }),
        ]);

        const unactivatedCount = Math.max(0, totalWords - totalUserCards);
        const availableNow = availableCardsCount + unactivatedCount;

        // 2. Upcoming cards (nextReview > now, sorted ascending)
        const upcoming = await UserCard.find({
            userId,
            status: { $in: ["LEARNING", "REVIEW"] },
            nextReview: { $gt: now },
        })
            .sort({ nextReview: 1 })
            .select("nextReview")
            .lean();

        const nextReviewAt = upcoming.length > 0 ? upcoming[0].nextReview : null;
        const minutesUntilNext = nextReviewAt
            ? Math.max(1, Math.round((nextReviewAt - now) / 60000))
            : null;

        // 3. Build timeline buckets
        // Group upcoming cards into human-readable time buckets
        const buckets = new Map(); // label → { count, nextReviewAt }

        for (const card of upcoming) {
            const diffMs = card.nextReview - now;
            const diffMin = diffMs / 60000;
            const diffDays = diffMs / 86400000;

            let label;
            if (diffMin < 60) {
                const mins = Math.ceil(diffMin);
                label = `${mins} phút nữa`;
            } else if (diffMin < 1440) {
                const hrs = Math.ceil(diffMin / 60);
                label = `${hrs} giờ nữa`;
            } else {
                const days = Math.round(diffDays);
                label = `${days} ngày nữa`;
            }

            if (!buckets.has(label)) {
                buckets.set(label, { label, count: 0, nextReviewAt: card.nextReview });
            }
            buckets.get(label).count++;
        }

        // Only return first 6 buckets for cleanliness
        const timeline = [...buckets.values()].slice(0, 6);

        // 4. Suggest a set that has due or new cards
        let suggestedSetId = null;

        // 4a. Try DUE cards first (prioritize review)
        const firstDueCard = await UserCard.findOne({
            userId,
            status: { $in: ["LEARNING", "REVIEW"] },
            nextReview: { $lte: now },
        }).select("wordId").lean();

        if (firstDueCard) {
            const word = await Word.findById(firstDueCard.wordId).select("setId").lean();
            if (word) suggestedSetId = word.setId;
        }

        // 4b. If no due cards, try NEW cards
        if (!suggestedSetId) {
            const firstNewCard = await UserCard.findOne({
                userId,
                status: "NEW",
            }).select("wordId").lean();
            if (firstNewCard) {
                const word = await Word.findById(firstNewCard.wordId).select("setId").lean();
                if (word) suggestedSetId = word.setId;
            }
        }

        // 4b. If no active cards, find first unactivated set (one with words but no usercards)
        if (!suggestedSetId && unactivatedCount > 0) {
            const allSets = await WordSet.find({ userId }).sort({ createdAt: -1 }).lean();
            for (const s of allSets) {
                if (s.wordCount > 0) {
                    // Check if this set has ANY word with a UserCard
                    const firstWord = await Word.findOne({ setId: s._id }).select("_id").lean();
                    if (firstWord) {
                        const cardExists = await UserCard.exists({ userId, wordId: firstWord._id });
                        if (!cardExists) {
                            suggestedSetId = s._id;
                            break;
                        }
                    }
                }
            }
        }

        res.json({
            data: {
                availableNow,
                nextReviewAt,
                minutesUntilNext,
                timeline,
                suggestedSetId,
            },
        });
    } catch (err) {
        console.error("[study] getStudySchedule error:", err);
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /study/ranking ──────────────────────────────────────────────────────
export const getRanking = async (req, res) => {
    try {
        const topUsersRaw = await User.find({})
            .sort({ currentStreak: -1 })
            .limit(10)
            .select("name picture currentStreak")
            .lean();

        const topUsers = topUsersRaw.map(u => ({ ...u, currentStreak: u.currentStreak || 0 }));

        // Get current user's rank
        const userId = await getUserMongoId(req.user.id);
        let currentUserRaw = await User.findById(userId).select("name picture currentStreak").lean();
        
        let currentUserRank = null;
        let currentUser = null;

        if (currentUserRaw) {
            currentUser = { ...currentUserRaw, currentStreak: currentUserRaw.currentStreak || 0 };
            
            // Check if user is in top 10
            const index = topUsers.findIndex(u => u._id.toString() === userId.toString());
            if (index !== -1) {
                currentUserRank = index + 1;
            } else {
                // If not in top 10, count how many users have a higher streak
                const higherStreakCount = await User.countDocuments({ currentStreak: { $gt: currentUser.currentStreak } });
                currentUserRank = higherStreakCount + 1;
            }
        }

        res.json({ 
            data: {
                topUsers,
                currentUser: currentUser ? {
                    ...currentUser,
                    rank: currentUserRank
                } : null
            }
        });
    } catch (err) {
        console.error("[study] getRanking error:", err);
        res.status(500).json({ message: err.message });
    }
};

