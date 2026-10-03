/**
 * Order model - a record of one checkout.
 *
 * Items are copied (title + price at purchase time) so an order stays
 * accurate even if the book is later renamed, repriced or removed.
 * An order only becomes "paid" after the payment provider's webhook
 * confirms it on the server - never based on the browser alone.
 */
import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    title: { type: String, required: true },
    // The LIST price: what the book costs before any payment fee. Commission is taken from this.
    priceCents: { type: Number, required: true, min: 0 },
    // Who sold it and how the money splits, frozen at purchase time so a later rate change never
    // rewrites history. Missing for the owner's own books (the owner keeps all of it).
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    commissionBps: Number,
    commissionCents: Number,
    sellerShareCents: Number,
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    items: { type: [orderItemSchema], validate: [(i) => i.length > 0, "An order needs at least one item"] },
    // subtotal = sum of list prices. total = what the customer is charged = subtotal + processing fee.
    subtotalCents: { type: Number, min: 0 },
    processingFeeCents: { type: Number, min: 0, default: 0 },
    totalCents: { type: Number, required: true, min: 0 },
    // The fee Paystack actually took (reported when the payment is confirmed), for reconciliation.
    providerFeeCents: { type: Number, min: 0 },
    currency: { type: String, default: "USD", uppercase: true },
    status: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending", index: true },
    // Which gateway handled it ("paystack", or "free" for zero-priced carts) and its
    // reference for this payment, used to match the provider's confirmation to the order.
    provider: { type: String, default: "paystack" },
    providerRef: { type: String, index: true, sparse: true },
    paidAt: Date,
  },
  { timestamps: true }
);

export const Order = mongoose.model("Order", orderSchema);
