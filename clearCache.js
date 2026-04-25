import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    console.log("Connected. Dropping YoutubeCache to force re-translation...");
    try {
        await mongoose.connection.collection("youtubecaches").drop();
        console.log("Dropped!");
    } catch(e) {
        console.log("Error or not exists:", e.message);
    }
    process.exit(0);
});
