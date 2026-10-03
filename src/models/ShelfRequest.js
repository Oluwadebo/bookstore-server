/**
 * ShelfRequest: an admin asks the owner to create a new shelf. Only the owner creates shelves,
 * so admins use this to suggest one. Approving it creates the shelf.
 */
import mongoose from "mongoose";

const shelfRequestSchema = new mongoose.Schema(
  {
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    // The name with spaces and symbols removed, to catch near-duplicates ("Sci-Fi" vs "sci fi").
    nameKey: { type: String, required: true, index: true },
    type: { type: String, enum: ["fiction", "non-fiction", "educational"], default: "fiction" },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    // Why the shelf is needed.
    reason: { type: String, trim: true, maxlength: 500, default: "" },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    decidedAt: Date,
    decisionNote: { type: String, trim: true, maxlength: 300, default: "" },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" }, // the shelf created on approval
  },
  { timestamps: true }
);

export const ShelfRequest = mongoose.model("ShelfRequest", shelfRequestSchema);
