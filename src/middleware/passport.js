import dotenv from "dotenv";
dotenv.config();
import passport from "passport";
import pkg from "passport-google-oauth20";
import User from "../models/User.js"; // Import cái model đã có mongoose ở trong

const { Strategy: GoogleStrategy } = pkg;

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL,
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const userData = {
                    googleId: profile.id,
                    email: profile.emails?.[0]?.value,
                    name: profile.displayName,
                    picture: profile.photos?.[0]?.value,
                    lastLogin: new Date()
                };

                // Lệnh này sẽ chạy mượt vì model User đã được khởi tạo với mongoose
                let user = await User.findOneAndUpdate(
                    { googleId: profile.id },
                    userData,
                    { new: true, upsert: true }
                );

                return done(null, user);
            } catch (err) {
                return done(err, null);
            }
        }
    )
);

export default passport;