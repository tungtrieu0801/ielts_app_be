import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
    },
    sender: {
        type: String,
        required: true,
    },
    picture: {
        type: String,
    },
    text: {
        type: String,
        required: true,
    },
    isAdmin: {
        type: Boolean,
        default: false,
    },
    replyTo: {
        sender: String,
        text: String,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
});

const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);

export default ChatMessage;
