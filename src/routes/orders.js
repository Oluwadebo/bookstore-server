/**
 * Checkout and orders, mounted at /api/orders. Signed-in customers only.
 *
 *   POST /api/orders/checkout          turn the cart into an order and start payment
 *   GET  /api/orders/verify?reference= confirm a payment when the customer returns
 *   GET  /api/orders                   the customer's paid orders
 *
 * The browser never sends prices or totals. The order is built here from the
 * database, and a payment only counts once the provider confirms the exact amount.
 */
import crypto from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { Book } from "../models/Book.js";
import { Order } from "../models/Order.js";
import { User } from "../models/User.js";
import { getDefaultCommissionBps, splitForItem } from "../services/commission.js";
import { customerFee } from "../services/fees.js";
import { getProvider } from "../payments/index.js";
import { fulfilOrder, settleOrder } from "../services/orders.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cleanString } from "../utils/validate.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Starting payments is expensive and abusable, so it gets its own limit.
const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many checkout attempts. Please try again later." },
});

router.post(
  "/checkout",
  checkoutLimiter,
  asyncHandler(async (req, res) => {
    const user = req.user;

    // Rebuild the order from the database. Books the customer already owns are skipped.
    const books = await Book.find({ _id: { $in: user.cart }, isPublished: true }).select("title priceCents currency createdBy").lean();
    const owned = new Set(user.library.map(String));
    const items = books.filter((book) => !owned.has(String(book._id)));

    if (items.length === 0) throw new ApiError(400, "Your cart is empty");

    const currencies = new Set(items.map((book) => book.currency));
    if (currencies.size > 1) {
      throw new ApiError(400, "Your cart has books priced in different currencies. Please check out one currency at a time.");
    }

    const currency = items[0].currency;
    const subtotalCents = items.reduce((sum, book) => sum + book.priceCents, 0);
    // The payment fee is added on top of the list price (see services/fees.js).
    const processingFeeCents = customerFee({ subtotalMinor: subtotalCents, currency });
    const totalCents = subtotalCents + processingFeeCents;
    const isFree = totalCents === 0;

    // Who sold each book and how the money splits, frozen on the order now.
    const creatorIds = [...new Set(items.map((book) => book.createdBy).filter(Boolean).map(String))];
    const creators = creatorIds.length ? await User.find({ _id: { $in: creatorIds } }).select("role commissionBps").lean() : [];
    const creatorById = new Map(creators.map((creator) => [String(creator._id), creator]));
    const defaultBps = await getDefaultCommissionBps();
    // Look up the provider first so an unconfigured store fails before an order is created.
    const provider = isFree ? null : getProvider();

    const order = await Order.create({
      user: user._id,
      items: items.map((book) => ({
        book: book._id,
        title: book.title,
        priceCents: book.priceCents,
        ...splitForItem({ priceCents: book.priceCents, creator: creatorById.get(String(book.createdBy)), defaultBps }),
      })),
      subtotalCents,
      processingFeeCents,
      totalCents,
      currency,
      provider: isFree ? "free" : provider.name,
    });

    // Free books need no payment page: grant them straight away.
    if (isFree) {
      await fulfilOrder(order._id);
      return res.json({ free: true });
    }

    // A unique, unguessable reference ties the provider's payment to this order.
    const reference = `bk_${crypto.randomBytes(12).toString("hex")}`;
    const checkout = await provider.createCheckout({
      reference,
      email: user.email,
      amountMinor: totalCents,
      currency,
      callbackUrl: `${env.clientUrl}/checkout/complete`,
      orderId: String(order._id),
    });

    order.providerRef = checkout.reference;
    await order.save();

    res.json({ url: checkout.url });
  })
);

router.get(
  "/verify",
  asyncHandler(async (req, res) => {
    const reference = cleanString(req.query.reference, 100);
    // Customers can only look up their own orders.
    const order = await Order.findOne({ providerRef: reference, user: req.user._id });
    if (!order) throw new ApiError(404, "Order not found");

    if (order.status === "pending") {
      const payment = await getProvider().verifyPayment(reference);
      await settleOrder(order, payment);
    }

    const latest = await Order.findById(order._id).select("status").lean();
    res.json({ status: latest.status });
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const orders = await Order.find({ user: req.user._id, status: "paid" }).sort({ paidAt: -1 }).limit(50).lean();
    res.json({ orders });
  })
);

export default router;
