/**
 * Authentication routes, mounted at /api/auth
 *
 *   POST /signup   create an account and sign in
 *   POST /login    sign in
 *   POST /logout   sign out
 *   GET  /me       who am I? (used by the React app on page load)
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";

import crypto from "node:crypto";
import { User, hashPassword } from "../models/User.js";
import { sendPasswordResetEmail } from "../services/emails.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { signToken, setAuthCookie, clearAuthCookie } from "../utils/token.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/**
 * Brute-force protection: 10 FAILED attempts per 15 minutes per IP.
 * Successful requests are not counted, so real customers are never locked out.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in 15 minutes." },
});

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores anything beyond 72 bytes

// A real bcrypt hash of a throwaway string. When the email is unknown we still
// compare against it, so response time does not reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

const isString = (value) => typeof value === "string";

function assertValidPassword(password) {
  if (password.length < 8) throw new ApiError(400, "Password must be at least 8 characters");
  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) throw new ApiError(400, "Password is too long (maximum 72 characters)");
}

// Password reset links last 30 minutes and work once. Only a hash of the token is stored.
const RESET_TTL_MS = 30 * 60 * 1000;
const RESEND_AFTER_MS = 60 * 1000;
const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in an hour." },
});

/** Standard success response: sets the cookie and returns the user. */
function sendSession(res, user, status = 200) {
  setAuthCookie(res, signToken(user._id));
  res.status(status).json({ user });
}

router.post(
  "/signup",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body ?? {};

    // Reject non-strings so objects like {"$ne": ""} can never reach a query.
    if (![name, email, password].every(isString)) {
      throw new ApiError(400, "Name, email and password are required");
    }
    if (name.trim().length < 2) throw new ApiError(400, "Please enter your name");
    if (!EMAIL_PATTERN.test(email.trim())) throw new ApiError(400, "Enter a valid email address");
    assertValidPassword(password);

    try {
      // Role is never taken from the request, so nobody can sign up as admin.
      const user = new User({ name, email });
      await user.setPassword(password);
      await user.save();
      sendSession(res, user, 201);
    } catch (err) {
      if (err.code === 11000) throw new ApiError(409, "An account with this email already exists");
      throw err;
    }
  })
);

router.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!isString(email) || !isString(password)) {
      throw new ApiError(400, "Email and password are required");
    }

    // passwordHash is excluded by default, so ask for it explicitly.
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+passwordHash");

    // Same work and same message whether the email or the password is wrong.
    const passwordOk = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !passwordOk) throw new ApiError(401, "Invalid email or password");

    sendSession(res, user);
  })
);

router.post(
  "/forgot-password",
  resetLimiter,
  asyncHandler(async (req, res) => {
    const email = isString(req.body?.email) ? req.body.email.trim().toLowerCase() : "";
    if (!EMAIL_PATTERN.test(email)) throw new ApiError(400, "Enter a valid email address");

    const user = await User.findOne({ email }).select("+passwordResetExpires");
    // Skip if a link was sent in the last minute (stops someone filling an inbox).
    const recentlySent = user?.passwordResetExpires && user.passwordResetExpires.getTime() - RESET_TTL_MS + RESEND_AFTER_MS > Date.now();
    if (user && !recentlySent) {
      const token = crypto.randomBytes(32).toString("hex");
      await User.updateOne({ _id: user._id }, { $set: { passwordResetHash: sha256(token), passwordResetExpires: new Date(Date.now() + RESET_TTL_MS) } });
      // Sent in the background so the response time doesn't reveal whether the account exists.
      sendPasswordResetEmail({ user, token }).catch((err) => console.error("Could not send reset email:", err.message));
    }

    // The same answer whether or not the email has an account (so nobody can probe for customers).
    res.json({ message: "If an account exists for that email, we've sent a reset link. It works for 30 minutes." });
  })
);

router.post(
  "/reset-password",
  resetLimiter,
  asyncHandler(async (req, res) => {
    const { token, password } = req.body ?? {};
    if (!isString(token) || !/^[a-f0-9]{64}$/.test(token) || !isString(password)) throw new ApiError(400, "This reset link is invalid or has expired. Please request a new one.");
    assertValidPassword(password);

    const user = await User.findOne({ passwordResetHash: sha256(token), passwordResetExpires: { $gt: new Date() } }).select("_id");
    if (!user) throw new ApiError(400, "This reset link is invalid or has expired. Please request a new one.");

    // New password, link used up, and every existing login stops working.
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordHash: await hashPassword(password), passwordChangedAt: new Date() }, $unset: { passwordResetHash: "", passwordResetExpires: "" } }
    );
    clearAuthCookie(res);
    res.json({ ok: true });
  })
);

router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
