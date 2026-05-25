import mongoose from "mongoose";

const speakingTopicSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        partType: {
            type: Number,
            required: true,
            enum: [1, 2, 3], // Part 1, Part 2, or Part 3
        },
        prompt: {
            type: String,
            required: true,
        },
        sampleAnswer: {
            type: String,
            required: true,
        },
        creatorEmail: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

// Add index for fast aggregation of speaking topics by partType
speakingTopicSchema.index({ partType: 1 });

const SpeakingTopic = mongoose.models.SpeakingTopic || mongoose.model("SpeakingTopic", speakingTopicSchema);

export default SpeakingTopic;
