/**
 * 404 and centralised error handling.
 * Every error ends up here, so clients always receive the same JSON shape:
 *   { "error": "human readable message" }
 */
import { env } from "../config/env.js";

/** Runs when no route matched the request. */
export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

/** Express recognises this as an error handler because it takes 4 arguments. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || "Something went wrong";

  // Mongoose: a field failed schema validation
  if (err.name === "ValidationError") {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join(", ");
  }
  // Mongoose: malformed ObjectId in a URL such as /books/not-an-id
  if (err.name === "CastError") {
    status = 400;
    message = `Invalid value for "${err.path}"`;
  }
  // MongoDB: unique index violated (for example, email already registered)
  if (err.code === 11000) {
    status = 409;
    message = `Already exists: ${Object.keys(err.keyValue || {}).join(", ")}`;
  }

  if (status >= 500) console.error(err);

  res.status(status).json({
    error: status >= 500 && env.isProduction ? "Internal server error" : message,
  });
}
