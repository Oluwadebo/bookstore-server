/**
 * AdminRequest: a customer's application to help manage the store.
 *
 * The site owner reviews these. Approving one makes the customer an admin;
 * declining keeps them a customer. Decided requests are kept as a history
 * (who decided, and when), so nothing is silently lost.
 */
import mongoose from "mongoose";

const adminRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Why they want access. Optional, but helps the owner decide.
    message: { type: String, trim: true, maxlength: 500, default: "" },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    decidedAt: Date,
  },
  { timestamps: true }
);

export const AdminRequest = mongoose.model("AdminRequest", adminRequestSchema);
