/**
 * User model - customers and admins.
 *
 * Passwords are never stored in plain text: only a bcrypt hash is kept, and
 * it is excluded from queries and JSON output by default.
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/** Hash a plain-text password (bcrypt). Used when setting or resetting a password. */
export const hashPassword = (plainPassword) => bcrypt.hash(plainPassword, SALT_ROUNDS);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Name is required"], trim: true, maxlength: 80 },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Enter a valid email address"],
    },
    passwordHash: { type: String, required: true, select: false },
    // "owner" is the single site owner (top authority), "admin" is a staff member the owner
    // approved, "user" is a normal customer. Roles are only ever changed on the server:
    // by the owner's approval flow, or by the make-admin script. Never from a request body.
    role: { type: String, enum: ["user", "admin", "owner"], default: "user" },

    // Books in the shopper's cart. Digital titles are bought once, so a cart
    // is just a list of book ids (no quantities needed).
    // A seller's own commission rate in basis points (1000 = 10%). Empty = the store's default.
    commissionBps: { type: Number, min: 0, max: 9000 },

    // Password reset: only a hash of the emailed token is stored, and it expires.
    passwordResetHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    // Sessions created before this moment stop working (a stolen login dies when the password changes).
    passwordChangedAt: Date,

    cart: [{ type: mongoose.Schema.Types.ObjectId, ref: "Book" }],
    // Purchased books ("My Library"), filled in after a verified payment.
    library: [{ type: mongoose.Schema.Types.ObjectId, ref: "Book" }],
  },
  {
    timestamps: true,
    toJSON: {
      // Safety net: never send the password hash to a client.
      transform: (doc, ret) => {
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

/** Hash a plain-text password and store the hash. Call before save(). */
userSchema.methods.setPassword = async function (plainPassword) {
  this.passwordHash = await hashPassword(plainPassword);
};

/** Compare a login attempt with the stored hash. Requires .select("+passwordHash"). */
userSchema.methods.verifyPassword = function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

export const User = mongoose.model("User", userSchema);
