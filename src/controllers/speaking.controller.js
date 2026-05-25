import mongoose from "mongoose";
import SpeakingTopic from "../models/SpeakingTopic.js";
import SpeakingAttempt from "../models/SpeakingAttempt.js";
import User from "../models/User.js";

// Helper to translate GoogleId to Mongoose ObjectId
const getUserMongoId = async (googleId) => {
    const user = await User.findOne({ googleId }).select("_id").lean();
    if (!user) throw new Error("User not found");
    return user._id;
};

// Helper to check if email has admin rights
const checkIsAdmin = (email) => {
    const adminEmails = ["trieutungvp@gmail.com", "dev@ielts-vocab.local"];
    return adminEmails.includes(email?.toLowerCase());
};

// ─── TOPICS CRUD (Admin-only for mutations) ──────────────────────────────────

// Create new topic
export const createTopic = async (req, res) => {
    try {
        if (!checkIsAdmin(req.user?.email)) {
            return res.status(403).json({ message: "Forbidden: Only admin can create speaking topics" });
        }

        const { title, partType, prompt, sampleAnswer } = req.body;
        if (!title || !partType || !prompt || !sampleAnswer) {
            return res.status(400).json({ message: "Bad Request: Missing required fields" });
        }

        const newTopic = new SpeakingTopic({
            title,
            partType: Number(partType),
            prompt,
            sampleAnswer,
            creatorEmail: req.user.email,
        });

        await newTopic.save();
        res.status(201).json({ message: "Speaking topic created successfully", topic: newTopic });
    } catch (error) {
        console.error("Error creating speaking topic:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// List all topics (with optional partType filter)
export const getTopics = async (req, res) => {
    try {
        const { partType } = req.query;
        const filter = {};
        if (partType) {
            filter.partType = Number(partType);
        }

        const topics = await SpeakingTopic.find(filter).sort({ createdAt: -1 });
        res.json({ topics });
    } catch (error) {
        console.error("Error fetching speaking topics:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// Get single topic
export const getTopicById = async (req, res) => {
    try {
        const topic = await SpeakingTopic.findById(req.params.id);
        if (!topic) {
            return res.status(404).json({ message: "Speaking topic not found" });
        }
        res.json({ topic });
    } catch (error) {
        console.error("Error fetching speaking topic:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// Get random topic (with optional partType filter)
export const getRandomTopic = async (req, res) => {
    try {
        const { partType } = req.query;
        const match = {};
        if (partType) {
            match.partType = Number(partType);
        }

        const topics = await SpeakingTopic.aggregate([
            { $match: match },
            { $sample: { size: 1 } }
        ]);

        if (!topics || topics.length === 0) {
            return res.status(404).json({ message: "No topics available under the selected part" });
        }

        res.json({ topic: topics[0] });
    } catch (error) {
        console.error("Error fetching random speaking topic:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// Update topic
export const updateTopic = async (req, res) => {
    try {
        if (!checkIsAdmin(req.user?.email)) {
            return res.status(403).json({ message: "Forbidden: Only admin can edit speaking topics" });
        }

        const { title, partType, prompt, sampleAnswer } = req.body;
        const topic = await SpeakingTopic.findById(req.params.id);
        if (!topic) {
            return res.status(404).json({ message: "Speaking topic not found" });
        }

        if (title) topic.title = title;
        if (partType) topic.partType = Number(partType);
        if (prompt) topic.prompt = prompt;
        if (sampleAnswer) topic.sampleAnswer = sampleAnswer;

        await topic.save();
        res.json({ message: "Speaking topic updated successfully", topic });
    } catch (error) {
        console.error("Error updating speaking topic:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// Delete topic
export const deleteTopic = async (req, res) => {
    try {
        if (!checkIsAdmin(req.user?.email)) {
            return res.status(403).json({ message: "Forbidden: Only admin can delete speaking topics" });
        }

        const topic = await SpeakingTopic.findByIdAndDelete(req.params.id);
        if (!topic) {
            return res.status(404).json({ message: "Speaking topic not found" });
        }

        // Clean up associated attempts
        await SpeakingAttempt.deleteMany({ topicId: req.params.id });

        res.json({ message: "Speaking topic and associated preparation logs deleted successfully" });
    } catch (error) {
        console.error("Error deleting speaking topic:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};


// ─── PREPARATION LOGS ────────────────────────────────────────────────────────

// Submit a practice attempt
export const submitAttempt = async (req, res) => {
    try {
        const { draftText, timeSpentSeconds } = req.body;
        const topicId = req.params.id;

        if (!draftText || timeSpentSeconds === undefined) {
            return res.status(400).json({ message: "Bad Request: Missing draft notes or duration" });
        }

        // Verify topic exists
        const topic = await SpeakingTopic.findById(topicId);
        if (!topic) {
            return res.status(404).json({ message: "Speaking topic not found" });
        }

        const userId = await getUserMongoId(req.user.id);
        const newAttempt = new SpeakingAttempt({
            userId,
            topicId,
            draftText,
            timeSpentSeconds: Number(timeSpentSeconds),
            submittedAt: new Date(),
        });

        await newAttempt.save();

        res.status(201).json({
            message: "Speaking preparation logged successfully",
            attempt: newAttempt,
            sampleAnswer: topic.sampleAnswer
        });
    } catch (error) {
        console.error("Error submitting speaking attempt:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// Get attempts history for logged-in user
export const getAttempts = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        
        const attempts = await SpeakingAttempt.find({ userId })
            .populate("topicId", "title partType prompt sampleAnswer")
            .sort({ submittedAt: -1 });

        res.json({ attempts });
    } catch (error) {
        console.error("Error fetching speaking attempts:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
