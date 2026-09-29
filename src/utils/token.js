/**
 * Login token helpers.
 *
 * After a successful login we sign a JWT containing only the user's id and
 * store it in an httpOnly cookie. httpOnly means JavaScript in the browser
 * cannot read it, which protects the session from XSS token theft.
 */
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const COOKIE_NAME = "token";

/** Create a signed token for a user id. Expires after JWT_EXPIRES_IN. */
export function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, {
    algorithm: "HS256",
    expiresIn: env.jwtExpiresIn,
  });
}

/** Verify a token. Throws if it is invalid, tampered with, or expired. */
export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
}

/** Cookie settings shared by set and clear (they must match to clear correctly). */
function cookieOptions() {
  return {
    httpOnly: true,
    // Browsers require Secure when SameSite=None. Always on in production.
    secure: env.isProduction || env.cookieSameSite === "none",
    sameSite: env.cookieSameSite,
    path: "/",
  };
}

/** Attach the login cookie to a response. Its lifetime matches the token's expiry. */
export function setAuthCookie(res, token) {
  const { exp } = jwt.decode(token);
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: exp * 1000 - Date.now() });
}

/** Remove the login cookie (logout). */
export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}
