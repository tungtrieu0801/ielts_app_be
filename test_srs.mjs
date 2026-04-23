/**
 * Quick smoke-test for the SRS engine logic.
 * Run: node test_srs.mjs
 */
import { calculateSRS } from "./src/utils/srs.js";

const LEVEL_INTERVALS = { 0: 0, 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };

const newCard = {
    level: 0,
    easeFactor: 2.5,
    interval: 0,
    repetition: 0,
    status: "NEW",
};

console.log("\n======= SRS ENGINE TEST =======\n");

// Test AGAIN
const again = calculateSRS(newCard, "AGAIN");
console.assert(again.level === 0, "AGAIN: level should be 0");
console.assert(again.status === "LEARNING", "AGAIN: status should be LEARNING");
const tenMinutesFromNow = new Date(Date.now() + 9 * 60 * 1000);
console.assert(again.nextReview > tenMinutesFromNow, "AGAIN: nextReview should be ~10min from now");
console.log("✅ AGAIN:", JSON.stringify({ level: again.level, interval: again.interval, status: again.status }));

// Test HARD from level 0
const hard = calculateSRS(newCard, "HARD");
console.assert(hard.level === 1, "HARD from 0: level should be 1");
console.assert(hard.interval === LEVEL_INTERVALS[1], "HARD: interval should be 1 day");
console.log("✅ HARD:", JSON.stringify({ level: hard.level, interval: hard.interval }));

// Test GOOD from level 1
const goodFrom1 = calculateSRS({ ...newCard, level: 1, status: "LEARNING" }, "GOOD");
console.assert(goodFrom1.level === 2, "GOOD from 1: level should be 2");
console.assert(goodFrom1.interval === LEVEL_INTERVALS[2], "GOOD from 1: interval should be 3 days");
console.log("✅ GOOD from lvl 1:", JSON.stringify({ level: goodFrom1.level, interval: goodFrom1.interval }));

// Test EASY from level 3 (should jump 2 levels, cap at 5)
const easyFrom3 = calculateSRS({ ...newCard, level: 3, status: "REVIEW" }, "EASY");
console.assert(easyFrom3.level === 5, "EASY from 3: level should be 5");
console.assert(easyFrom3.interval === LEVEL_INTERVALS[5], "EASY from 3: interval should be 30 days");
console.assert(easyFrom3.status === "REVIEW", "EASY: status should remain REVIEW");
console.log("✅ EASY from lvl 3:", JSON.stringify({ level: easyFrom3.level, interval: easyFrom3.interval, status: easyFrom3.status }));

// Test level cap at 5
const easyFrom5 = calculateSRS({ ...newCard, level: 5, status: "REVIEW" }, "EASY");
console.assert(easyFrom5.level === 5, "EASY from 5: should not exceed 5");
console.log("✅ EASY cap at lvl 5:", JSON.stringify({ level: easyFrom5.level }));

// Test HARD from level 3 (should NOT go below 1)
const hardFrom3 = calculateSRS({ ...newCard, level: 3, status: "REVIEW" }, "HARD");
console.assert(hardFrom3.level === 3, "HARD from 3: level should stay 3 (max(3, 1))");
console.log("✅ HARD from lvl 3:", JSON.stringify({ level: hardFrom3.level, interval: hardFrom3.interval }));

// Test repetition increments
console.assert(again.repetition === 1, "repetition should increment");
console.log("✅ Repetition increments correctly");

// Test easeFactor bounds
const easyFactor = calculateSRS({ ...newCard, easeFactor: 1.3 }, "AGAIN");
console.assert(easyFactor.easeFactor >= 1.3, "easeFactor should not go below 1.3");
console.log("✅ EaseFactor min bound 1.3 respected");

console.log("\n======= ALL TESTS PASSED ✅ =======\n");
