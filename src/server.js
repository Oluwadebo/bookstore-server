/**
 * Entry point: connects to MongoDB, then starts listening for requests.
 * Run with `npm run dev` (auto-restart) or `npm start` (production).
 */

import dns from "dns";
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
dns.setDefaultResultOrder("ipv4first");
import { env } from "./config/env.js";
import { connectDB, disconnectDB } from "./config/db.js";
import app from "./app.js";

async function main() {
  await connectDB();
  const server = app.listen(env.port, () => {
    console.log(`API running on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  // Close cleanly when the host stops the process (deploys, Ctrl+C).
  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
