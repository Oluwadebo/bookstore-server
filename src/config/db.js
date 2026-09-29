/**
 * MongoDB connection helpers (Mongoose).
 */
import mongoose from "mongoose";
import { env } from "./env.js";

// Ignore query keys that are not in the schema instead of returning wrong results.
mongoose.set("strictQuery", true);

/** Connect to MongoDB. Throws if the connection cannot be established. */
export async function connectDB() {
  await mongoose.connect(env.mongoUri);
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
}

/** Close the connection (used on shutdown and by the seed script). */
export async function disconnectDB() {
  await mongoose.disconnect();
}
