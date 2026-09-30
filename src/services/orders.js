/**
 * Order fulfilment: turning a confirmed payment into owned books.
 *
 * Two things can confirm a payment: the customer returning from the payment page
 * (we then ask the provider) and the provider's webhook. Either may arrive first,
 * or both at once. Everything here is safe to run repeatedly: a book is granted
 * exactly once and never lost.
 */
import { Order } from "../models/Order.js";
import { User } from "../models/User.js";

/**
 * Mark a pending order as paid and give the customer their books.
 * Returns true only for the call that actually completed the payment.
 */
export async function fulfilOrder(orderId) {
  // Atomic pending -> paid switch: if two requests race, only one wins.
  const justPaid = await Order.findOneAndUpdate(
    { _id: orderId, status: "pending" },
    { status: "paid", paidAt: new Date() },
    { new: true }
  );

  const order = justPaid ?? (await Order.findById(orderId));
  if (!order || order.status !== "paid") return false;

  // Granting is idempotent ($addToSet) and repeated on purpose, so a crash between
  // the two steps can never leave a paid customer without their books.
  const bookIds = order.items.map((item) => item.book);
  await User.updateOne({ _id: order.user }, { $addToSet: { library: { $each: bookIds } }, $pull: { cart: { $in: bookIds } } });

  return Boolean(justPaid);
}

/**
 * Apply what the provider told us about a payment to an order.
 * `payment` is { status: "paid" | "failed" | "pending", amountMinor, currency }.
 * A "paid" report is only trusted if the amount and currency match the order,
 * which stops anyone paying a small amount for an expensive order.
 */
export async function settleOrder(order, payment) {
  if (payment.status === "paid") {
    if (payment.amountMinor !== order.totalCents || payment.currency !== order.currency) {
      console.error(`Payment mismatch on order ${order._id}: expected ${order.totalCents} ${order.currency}, got ${payment.amountMinor} ${payment.currency}`);
      return false;
    }
    return fulfilOrder(order._id);
  }
  if (payment.status === "failed") {
    await Order.updateOne({ _id: order._id, status: "pending" }, { status: "failed" });
  }
  return false;
}
