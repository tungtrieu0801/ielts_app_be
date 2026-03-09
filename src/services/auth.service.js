import { generateToken } from "../utils/jwt.js";

export const handleGoogleLogin = (user) => {

    const token = generateToken(user);

    return {
        user,
        token
    };

};