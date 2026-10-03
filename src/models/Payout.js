/**
 * Payout: a record that the owner paid a seller some of what they earned.
 * This is a ledger entry only (the actual bank transfer happens outside the app). A seller's
 * balance is always: what they earned - the sum of their payouts.
 */
import mongoose from "mongoose";

const payoutSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amountCents: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    // Bank transfer reference or receipt number, so the entry can be matched to the bank statement.
    reference: { type: String, trim: true, maxlength: 100, default: "" },
    note: { type: String, trim: true, maxlength: 300, default: "" },
    paidAt: { type: Date, default: Date.now, index: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

export const Payout = mongoose.model("Payout", payoutSchema);
