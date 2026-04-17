import mongoose from "mongoose";

const wordSchema = new mongoose.Schema(
    {
        // Core vocabulary fields
        english: {
            type: String,
            required: true,
            trim: true,
        },
        vietnamese: {
            type: String,
            required: true,
            trim: true,
        },
        // Phiên âm IPA, ví dụ: /ˈæb.sələt/
        pronunciation: {
            type: String,
            default: "",
            trim: true,
        },
        // Từ loại: noun, verb, adjective, adverb, phrase...
        partOfSpeech: {
            type: String,
            default: "",
            trim: true,
        },
        example: {
            type: String,
            default: "",
            trim: true,
        },
        synonyms: {
            type: [String],
            default: [],
        },
        antonyms: {
            type: [String],
            default: [],
        },

        // Relations
        setId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "WordSet",
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        // SM-2 SRS fields
        nextReview: {
            type: Date,
            default: () => new Date(), // Review ngay lần đầu
        },
        interval: {
            type: Number,
            default: 0, // in days
        },
        repetition: {
            type: Number,
            default: 0, // Số lần học thành công liên tiếp
        },
        easeFactor: {
            type: Number,
            default: 2.5, // EF (Ease Factor) mặc định theo SM-2
        },
        lastReviewed: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Index để lấy nhanh các thẻ cần ôn hôm nay
wordSchema.index({ userId: 1, nextReview: 1 });
wordSchema.index({ setId: 1, nextReview: 1 });

const Word = mongoose.model("Word", wordSchema);

export default Word;
