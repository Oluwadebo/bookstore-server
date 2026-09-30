/**
 * Manage roles from the server (the only way to change the OWNER):
 *
 *   npm run make-admin -- someone@example.com            make them an admin
 *   npm run make-admin -- someone@example.com --remove   back to a regular customer
 *   npm run make-admin -- someone@example.com --owner    transfer ownership to them
 *
 * Most admins should simply apply from their Account page and be approved by the owner
 * on the Team screen. This script is for the developer: creating the first owner,
 * rescuing access, and handing the store to its real owner when the site is delivered.
 * Transferring ownership makes the previous owner a regular admin, so there is always
 * exactly one owner.
 */
import { connectDB, disconnectDB } from "../config/db.js";
import { User } from "../models/User.js";

const email = process.argv[2]?.trim().toLowerCase();
const remove = process.argv.includes("--remove");
const makeOwner = process.argv.includes("--owner");

if (!email || email.startsWith("--") || (remove && makeOwner)) {
  console.error("Usage: npm run make-admin -- someone@example.com [--remove | --owner]");
  process.exit(1);
}

await connectDB();
let exitCode = 0;
const user = await User.findOne({ email });

if (!user) {
  console.error(`No account found for ${email}. They need to sign up first.`);
  exitCode = 1;
} else if (remove && user.role === "owner") {
  console.error("That account is the site owner. Transfer ownership to someone else first (--owner).");
  exitCode = 1;
} else if (makeOwner) {
  const demoted = await User.updateMany({ role: "owner", _id: { $ne: user._id } }, { role: "admin" });
  user.role = "owner";
  await user.save();
  console.log(`${user.email} is now the site owner.${demoted.modifiedCount ? " The previous owner is now a regular admin." : ""}`);
} else {
  user.role = remove ? "user" : user.role === "owner" ? "owner" : "admin";
  await user.save();
  console.log(`${user.email} is now ${user.role === "owner" ? "the site owner (unchanged)" : user.role === "admin" ? "an admin" : "a regular customer"}.`);
}

await disconnectDB();
process.exit(exitCode);
