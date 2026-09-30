/**
 * Express application setup (no server listening here, which keeps the app
 * easy to test). Routes for auth, books, cart and orders are added in the
 * next steps; this file wires up the security and parsing middleware.
 */
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";

import { env } from "./config/env.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/auth.js";
import bookRoutes from "./routes/books.js";
import categoryRoutes from "./routes/categories.js";
import cartRoutes from "./routes/cart.js";
import orderRoutes from "./routes/orders.js";
import libraryRoutes from "./routes/library.js";
import downloadRoutes from "./routes/downloads.js";
import paymentRoutes from "./routes/payments.js";

const app = express();

// Trust the first proxy (Render, Railway, Heroku...) so rate limiting sees real client IPs.
app.set("trust proxy", 1);

// Secure HTTP headers.
app.use(helmet());

// Only the React app may call this API from a browser. `credentials` lets the
// login cookie travel with requests.
app.use(cors({ origin: env.clientUrl, credentials: true }));

// Payment webhooks need the RAW request body to verify the provider's signature,
// so this router is mounted BEFORE express.json() below.
app.use("/api/payments", paymentRoutes);

app.use(express.json({ limit: "10kb" })); // small limit: blocks oversized payloads
app.use(cookieParser());
if (!env.isProduction) app.use(morgan("dev"));

// Basic abuse protection: 300 requests per 15 minutes per IP across the API.
// Login and signup have their own stricter limit (see routes/auth.js).
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

// Health check: used by the React app, uptime monitors and hosting platforms.
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    time: new Date().toISOString(),
  });
});

// --- Feature routes are mounted here as they are built ---
app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/library", libraryRoutes);
app.use("/api/downloads", downloadRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
