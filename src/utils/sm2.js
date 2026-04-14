/**
 * SM-2 (SuperMemo-2) Spaced Repetition Algorithm
 *
 * Quality grades:
 *  0 = Again  (Blackout — không nhớ gì)
 *  1 = Hard   (Nhớ nhưng rất khó)
 *  2 = Good   (Nhớ sau một chút do dự)
 *  3 = Easy   (Nhớ hoàn toàn, dễ dàng)
 *
 * Returns updated SRS data to be saved to DB.
 */

export const calculateSM2 = ({ repetition, interval, easeFactor }, quality) => {
    // quality phải là 0-3, map sang SM-2 scale 0-5
    // Again=0 → q=0, Hard=1 → q=2, Good=2 → q=4, Easy=3 → q=5
    const qMap = { 0: 0, 1: 2, 2: 4, 3: 5 };
    const q = qMap[quality] ?? 4;

    let newRepetition = repetition;
    let newInterval = interval;
    let newEaseFactor = easeFactor;

    if (q < 3) {
        // Lại từ đầu nếu không nhớ (Again hoặc Hard)
        newRepetition = 0;
        newInterval = 1;
    } else {
        // Tính interval theo SM-2
        if (repetition === 0) {
            newInterval = 1;
        } else if (repetition === 1) {
            newInterval = 6;
        } else {
            newInterval = Math.round(interval * easeFactor);
        }
        newRepetition = repetition + 1;
    }

    // Cập nhật EaseFactor (luôn min 1.3)
    newEaseFactor = Math.max(
        1.3,
        easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    );

    // Tính ngày ôn tiếp theo
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + newInterval);

    return {
        repetition: newRepetition,
        interval: newInterval,
        easeFactor: parseFloat(newEaseFactor.toFixed(2)),
        nextReview,
        lastReviewed: new Date(),
    };
};
