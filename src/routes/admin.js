/**
 * Admin area API, mounted at /api/admin. Every route here needs a signed-in ADMIN;
 * regular customers get 403 and visitors get 401.
 *
 *   GET /api/admin/stats     numbers for the dashboard
 *   GET /api/admin/orders    recent orders. ?status=paid|pending|failed|refunded ?page=
 *   ...books and shelves are handled by adminBooks.js and adminCategories.js
 */
import { Router } from "express";
import { Book } from "../models/Book.js";
import { Category } from "../models/Category.js";
import { Order } from "../models/Order.js";
import { User } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cleanString, toInt } from "../utils/validate.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import adminBooks from "./adminBooks.js";
import adminCategories from "./adminCategories.js";

const router = Router();
router.use(requireAuth, requireAdmin);

router.use("/books", adminBooks);
router.use("/categories", adminCategories);

router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const [books, published, categories, customers, revenue] = await Promise.all([
      Book.countDocuments(),
      Book.countDocuments({ isPublished: true }),
      Category.countDocuments(),
      User.countDocuments({ role: "user" }),
      // Revenue is reported per currency, because amounts in different currencies cannot be added.
      Order.aggregate([
        { $match: { status: "paid" } },
        { $group: { _id: "$currency", orders: { $sum: 1 }, revenueCents: { $sum: "$totalCents" } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({
      books,
      published,
      drafts: books - published,
      categories,
      customers,
      revenue: revenue.map((row) => ({ currency: row._id, orders: row.orders, revenueCents: row.revenueCents })),
    });
  })
);

router.get(
  "/orders",
  asyncHandler(async (req, res) => {
    const status = cleanString(req.query.status);
    const page = toInt(req.query.page, 1, 1, 10000);
    const limit = toInt(req.query.limit, 20, 1, 100);
    const filter = ["pending", "paid", "failed", "refunded"].includes(status) ? { status } : {};

    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate("user", "name email").lean(),
      Order.countDocuments(filter),
    ]);
    res.json({ orders, page, limit, total, totalPages: Math.ceil(total / limit) });
  })
);

export default router;
