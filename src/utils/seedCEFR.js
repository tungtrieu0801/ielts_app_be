import mongoose from "mongoose";
import dotenv from "dotenv";
import { translate } from "google-translate-api-x";
import Word from "../models/Word.js";
import WordSet from "../models/WordSet.js";
import User from "../models/User.js";
import connectDB from "../config/db.js";

dotenv.config();

const LEVEL_COLORS = {
    A1: "green",
    A2: "teal",
    B1: "blue",
    B2: "orange",
    C1: "red"
};

const BATCH_SIZE = 120; // safe batch size for google translation join

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
        console.log("Created System User.");
    }
    return user._id;
}

async function run() {
    try {
        console.log("Connecting to database...");
        await connectDB();
        console.log("Connected.");

        const systemUserId = await getOrCreateSystemUser();

        console.log("Fetching Oxford 5000 vocabulary data...");
        const res = await fetch("https://raw.githubusercontent.com/winterdl/oxford-5000-vocabulary-audio-definition/main/data/oxford_5000.json");
        if (!res.ok) {
            throw new Error(`Failed to fetch Oxford 5000 data: ${res.status}`);
        }
        const json = await res.json();
        const items = Object.values(json);
        console.log(`Loaded ${items.length} items from online list.`);

        // Group items by CEFR level
        const grouped = { A1: [], A2: [], B1: [], B2: [], C1: [] };
        for (const item of items) {
            const lvl = (item.cefr || "").toUpperCase();
            if (grouped[lvl]) {
                grouped[lvl].push(item);
            }
        }

        for (const [level, rawWords] of Object.entries(grouped)) {
            console.log(`\n--- Seeding Level ${level} (${rawWords.length} words) ---`);

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
                console.log(`Created WordSet: ${setTitle}`);
            }

            // Check if words already exist in this set
            const existingCount = await Word.countDocuments({ setId: wordSet._id });
            if (existingCount > 0) {
                console.log(`WordSet ${setTitle} already has ${existingCount} words. Skipping.`);
                continue;
            }

            // Seed words in batches with translation
            console.log(`Translating and inserting ${rawWords.length} words...`);
            const wordsToInsert = [];

            for (let i = 0; i < rawWords.length; i += BATCH_SIZE) {
                const batch = rawWords.slice(i, i + BATCH_SIZE);
                const batchWords = batch.map(w => w.word);

                console.log(`  Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(rawWords.length / BATCH_SIZE)} (${batch.length} words)...`);

                let translatedList = [];
                try {
                    const textToTranslate = batchWords.join(" | ");
                    const transRes = await translate(textToTranslate, { to: "vi" });
                    translatedList = transRes.text.split(" | ").map(t => t.trim());

                    if (translatedList.length !== batch.length) {
                        // fallback if splitter fails due to separator mismatch in translation
                        console.warn("  Translation split mismatch, fallback translating individually...");
                        translatedList = [];
                        for (const w of batchWords) {
                            const singleRes = await translate(w, { to: "vi" });
                            translatedList.push(singleRes.text.trim());
                            await delay(100);
                        }
                    }
                } catch (err) {
                    console.error("  Translation failed, using English as fallback meaning:", err.message);
                    translatedList = batchWords;
                }

                // Map to Word models
                for (let j = 0; j < batch.length; j++) {
                    const item = batch[j];
                    const viMeaning = translatedList[j] || item.word;

                    wordsToInsert.push({
                        english: item.word,
                        vietnamese: viMeaning,
                        pronunciation: item.phon_br || item.phon_n_am || "",
                        partOfSpeech: item.type || "",
                        example: item.example || "",
                        exampleTranslation: "", // can be generated or translated later
                        synonyms: [],
                        antonyms: [],
                        note: "",
                        setId: wordSet._id,
                        userId: systemUserId
                    });
                }

                // Wait a bit to be polite to Google Translate API
                await delay(800);
            }

            if (wordsToInsert.length > 0) {
                console.log(`  Inserting ${wordsToInsert.length} words into Database...`);
                await Word.insertMany(wordsToInsert);
                wordSet.wordCount = wordsToInsert.length;
                await wordSet.save();
                console.log(`  Done seeding level ${level}.`);
            }
        }

        console.log("\nAll CEFR word sets seeded successfully! 🚀");
        mongoose.connection.close();
    } catch (e) {
        console.error("Seeding failed with error:", e);
        mongoose.connection.close();
    }
}

run();
