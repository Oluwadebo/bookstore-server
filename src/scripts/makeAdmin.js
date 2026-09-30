/**
 * Give an existing customer admin rights (or take them away):
 *
 *   npm run make-admin -- someone@example.com
 *   npm run make-admin -- someone@example.com --remove
 *
 * The person must already have signed up on the site. This runs on the server only,
 * so nobody can promote themselves through the website.
 */
import { connectDB, disconnectDB } from "../config/db.js";
import { User } from "../models/User.js";

const email = process.argv[2]?.trim().toLowerCase();
const remove = process.argv.includes("--remove");

if (!email || email.startsWith("--")) {
  console.error("Usage: npm run make-admin -- someone@example.com [--remove]");
  process.exit(1);
}

await connectDB();
const user = await User.findOneAndUpdate({ email }, { role: remove ? "user" : "admin" }, { new: true });
console.log(user ? `${user.email} is now ${user.role === "admin" ? "an admin" : "a regular customer"}.` : `No account found for ${email}. They need to sign up first.`);
await disconnectDB();
process.exit(user ? 0 : 1);
