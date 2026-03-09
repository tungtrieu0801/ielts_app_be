import dotenv from "dotenv";
dotenv.config();
import passport from "passport";
import pkg from "passport-google-oauth20";

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

                const user = {
                    googleId: profile.id,
                    email: profile.emails?.[0]?.value,
                    name: profile.displayName,
                    avatar: profile.photos?.[0]?.value,
                };

                return done(null, user);

            } catch (err) {
                return done(err, null);
            }
        }
    )
);

export default passport;