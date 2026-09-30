/** True only for a 24-character hex string, i.e. a valid MongoDB ObjectId in text form. */
export const isObjectId = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);

import { ApiError } from "./ApiError.js";

/**
 * For data that gets SAVED: returns the trimmed text, or throws a 400 if it is not text
 * or is too long. (Unlike cleanString, it never silently cuts input short, which could
 * turn an invalid value like "NAIRA" into a valid-looking "NAI".)
 */
export function strictText(value, max, label) {
  if (typeof value !== "string") throw new ApiError(400, `${label} must be text`);
  const text = value.trim();
  if (text.length > max) throw new ApiError(400, `${label} must be at most ${max} characters`);
  return text;
}

/** Accept only plain strings from user input; anything else becomes "". */
export const cleanString = (value, max = 100) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Parse an integer and clamp it into a safe range. */
export function toInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : Math.min(Math.max(n, min), max);
}

/** Make user text safe to use inside a regular expression. */
export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
