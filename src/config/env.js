/**
 * Environment configuration.
 *
 * Loads `.env`, checks that the required values exist, and exports one
 * typed `env` object. The rest of the app imports from here instead of
 * reading `process.env` directly, so a missing setting fails fast at
 * startup with a clear message rather than deep inside a request.
 */
import "dotenv/config";

const REQUIRED = ["MONGODB_URI", "JWT_SECRET"];
const missing = REQUIRED.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  console.error('Copy ".env.example" to ".env" and fill in the values.');
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
  console.error("JWT_SECRET must be at least 32 characters long.");
  process.exit(1);
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI,
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
};
