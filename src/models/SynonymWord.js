import mongoose from "mongoose";

const synonymWordSchema = new mongoose.Schema(
    {
        // Which cluster group this word belongs to (e.g. "Chật hẹp / Đông đúc")
        cluster: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        // The English word
        word: {
            type: String,
            required: true,
            trim: true,
        },
        // Part of Speech: Noun, Verb, Adj, Adv...
        partOfSpeech: {
            type: String,
            default: "",
            trim: true,
        },
        // Band/Level: B1, B2, C1, C2...
        bandLevel: {
            type: String,
            default: "",
            trim: true,
        },
        // Explanation & Context (why to use this word)
        explanation: {
            type: String,
            default: "",
        },
        // Example sentence in English (contains the word)
        exampleSentence: {
            type: String,
            default: "",
        },
        // Vietnamese translation of example
        exampleTranslation: {
            type: String,
            default: "",
        },
        // Owner
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
    },
    {
        timestamps: true,
    }
);

// Compound indexes for fast queries
synonymWordSchema.index({ userId: 1, cluster: 1 });
synonymWordSchema.index({ cluster: 1, userId: 1 });

const SynonymWord = mongoose.model("SynonymWord", synonymWordSchema);

export default SynonymWord;
