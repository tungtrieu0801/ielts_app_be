/**
 * SRS 5-Level Engine
 *
 * Level → Interval mapping:
 *   0 → 30 minutes (learning phase — not yet graduated)
 *   1 → 1 day
 *   2 → 3 days
 *   3 → 7 days
 *   4 → 14 days
 *   5 → 30 days
 *
 * Learning phase rules (level === 0):
 *   AGAIN → level 0, +30 min
 *   HARD  → level 0, +30 min  (NOT graduated — still learning)
 *   GOOD  → level 1, +1 day   (graduates to review)
 *   EASY  → level 2, +3 days  (graduates and skips ahead)
 *
 * Review phase rules (level >= 1):
 *   AGAIN → level 0, +30 min  (demoted back to learning)
 *   HARD  → same level, same interval (no progress)
 *   GOOD  → level + 1 (capped at 5)
 *   EASY  → level + 2 (capped at 5)
 *
 * Answer quality: "AGAIN" | "HARD" | "GOOD" | "EASY"
 */

const LEVEL_INTERVALS = {
    0: 0,   // handled as 10-minute re-queue
    1: 1,
    2: 3,
    3: 7,
    4: 14,
    5: 30,
};

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

/**
 * @param {Object} card - { level, easeFactor, interval, repetition, status }
 * @param {string} quality - "AGAIN" | "HARD" | "GOOD" | "EASY"
 * @returns {Object} Updated SRS fields
 */
export function calculateSRS(card, quality) {
    const now = new Date();
    let { level, easeFactor, repetition } = card;

    let newLevel, newInterval, nextReview;
    const isLearning = level === 0; // learning phase

    switch (quality) {
        case "AGAIN":
            // Always reset to learning phase
            newLevel = 0;
            newInterval = 0;
            nextReview = new Date(now.getTime() + THIRTY_MINUTES_MS);
            break;

        case "HARD":
            if (isLearning) {
                // Still learning — stay at level 0, re-queue in 30 min
                newLevel = 0;
                newInterval = 0;
                nextReview = new Date(now.getTime() + THIRTY_MINUTES_MS);
            } else {
                // Review phase — no progress, keep same level & interval
                newLevel = level;
                newInterval = LEVEL_INTERVALS[level];
                nextReview = addDays(now, newInterval);
            }
            break;

        case "GOOD":
            // Graduate from learning, or advance one level in review
            newLevel = Math.min(level + 1, 5);
            newInterval = LEVEL_INTERVALS[newLevel];
            nextReview = newInterval === 0
                ? new Date(now.getTime() + THIRTY_MINUTES_MS)
                : addDays(now, newInterval);
            break;

        case "EASY":
            // Graduate from learning and skip ahead, or advance two levels in review
            newLevel = Math.min(level + 2, 5);
            newInterval = LEVEL_INTERVALS[newLevel];
            nextReview = newInterval === 0
                ? new Date(now.getTime() + THIRTY_MINUTES_MS)
                : addDays(now, newInterval);
            break;

        default:
            throw new Error(`Invalid quality: ${quality}`);
    }

    // Update easeFactor (1.3 – 3.0), penalise AGAIN/HARD, reward EASY
    const qualityScore = { AGAIN: 0, HARD: 1, GOOD: 3, EASY: 5 }[quality];
    const newEaseFactor = Math.min(3.0, Math.max(
        1.3,
        easeFactor + (0.1 - (5 - qualityScore) * (0.08 + (5 - qualityScore) * 0.02))
    ));

    // Status: NEW → LEARNING on first answer; LEARNING → REVIEW when graduated (level >= 1)
    let newStatus;
    if (card.status === "NEW") {
        newStatus = newLevel >= 1 ? "REVIEW" : "LEARNING";
    } else {
        newStatus = newLevel >= 1 ? "REVIEW" : "LEARNING";
    }

    return {
        level: newLevel,
        interval: newInterval,
        easeFactor: parseFloat(newEaseFactor.toFixed(2)),
        repetition: repetition + 1,
        lastReviewed: now,
        nextReview,
        status: newStatus,
    };
}

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}
