/**
 * Admin area API, mounted at /api/admin. Every route here needs a signed-in ADMIN;
 * regular customers get 403 and visitors get 401.
 *
 *   GET /api/admin/stats     numbers for the dashboard (admins: their own books only)
 *   GET /api/admin/orders    recent orders (OWNER ONLY). ?status=paid|pending|failed|refunded ?page=
 *   ...books and shelves are handled by adminBooks.js and adminCategories.js
 *   ...team management (who may be an admin) is owner-only: adminTeam.js
 */
import { Router } from "express";
import { Book } from "../models/Book.js";
import { Category } from "../models/Category.js";
import { Order } from "../models/Order.js";
import { User } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cleanString, toInt } from "../utils/validate.js";
import { requireAdmin, requireAuth, requireOwner } from "../middleware/auth.js";
import adminBooks from "./adminBooks.js";
import adminCategories from "./adminCategories.js";
import adminTeam from "./adminTeam.js";
import { AdminRequest } from "../models/AdminRequest.js";

const router = Router();
router.use(requireAuth, requireAdmin);

router.use("/books", adminBooks);
router.use("/categories", adminCategories);
router.use("/team", adminTeam);

router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const isOwner = req.user.role === "owner";
    // An admin's numbers cover only their own books and shelves. Customers, sales and
    // applications are the owner's business, so admins get nothing for those.
    const own = isOwner ? {} : { createdBy: req.user._id };

    const [books, published, categories, customers, revenue, pendingAdminRequests] = await Promise.all([
      Book.countDocuments(own),
      Book.countDocuments({ ...own, isPublished: true }),
      Category.countDocuments(own),
      isOwner ? User.countDocuments({ role: "user" }) : Promise.resolve(null),
      // Revenue is reported per currency, because amounts in different currencies cannot be added.
      isOwner
        ? Order.aggregate([
            { $match: { status: "paid" } },
            { $group: { _id: "$currency", orders: { $sum: 1 }, revenueCents: { $sum: "$totalCents" } } },
            { $sort: { _id: 1 } },
          ])
        : Promise.resolve(null),
      isOwner ? AdminRequest.countDocuments({ status: "pending" }) : Promise.resolve(null),
    ]);

    res.json({
      scope: isOwner ? "all" : "own",
      books,
      published,
      drafts: books - published,
      categories,
      customers,
      pendingAdminRequests,
      revenue: revenue ? revenue.map((row) => ({ currency: row._id, orders: row.orders, revenueCents: row.revenueCents })) : null,
    });
  })
);

router.get(
  "/orders",
  requireOwner, // sales and customer details are the owner's business
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
