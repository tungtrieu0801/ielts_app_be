import mongoose from "mongoose";

const wordSetSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            default: "",
            trim: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        wordCount: {
            type: Number,
            default: 0,
        },
        // Màu sắc ngẫu nhiên cho card
        color: {
            type: String,
            default: "blue",
        },
        // Public = visible to all users; private = owner only
        isPublic: {
            type: Boolean,
            default: false,
            index: true,
        },
        // If this set was forked from another, store the source id
        forkedFrom: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "WordSet",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

const WordSet = mongoose.model("WordSet", wordSetSchema);

export default WordSet;
