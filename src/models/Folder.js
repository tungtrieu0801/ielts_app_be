import mongoose from "mongoose";

const folderSchema = new mongoose.Schema(
    {
        name: {
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
        color: {
            type: String,
            default: "purple",
        },
    },
    {
        timestamps: true,
    }
);

const Folder = mongoose.model("Folder", folderSchema);

export default Folder;
