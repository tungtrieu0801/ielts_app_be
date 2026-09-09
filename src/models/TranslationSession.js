import mongoose from "mongoose";

const sentenceSchema = new mongoose.Schema({
    original: { type: String, required: true },
    roughTranslation: { type: String, default: "" },
    polishedTranslation: { type: String, default: "" },
    notes: { type: String, default: "" }
});

const vocabSchema = new mongoose.Schema({
    english: { type: String, required: true },
    vietnamese: { type: String, default: "" }
});

const TranslationSessionSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        title: { type: String, required: true, trim: true },
        originalText: { type: String, default: "" },
        sentences: [sentenceSchema],
        vocab: [vocabSchema],
        grammarNotes: { type: String, default: "" },
        currentIdx: { type: Number, default: 0 },
        status: { type: String, enum: ["in_progress", "completed"], default: "in_progress" }
    },
    { timestamps: true }
);

export default mongoose.models.TranslationSession || mongoose.model("TranslationSession", TranslationSessionSchema);
