import mongoose from "mongoose";

const connectDB = async () => {
    try {
        await mongoose.connect(`${process.env.DB_HOST}/${process.env.DB_NAME}`, {
            auth: {
                username: process.env.DB_USERNAME,
                password: process.env.DB_PASSWORD,
            },
            authSource: "admin",
        });

        console.log("✅ MongoDB connected");
    } catch (err) {
        console.error("❌ MongoDB connection error:", err);
        process.exit(1);
    }
};

export default connectDB;