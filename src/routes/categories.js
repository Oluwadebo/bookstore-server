/**
 * Category (shelf) routes, mounted at /api/categories. Public, read-only.
 * Categories are created and edited through the admin area (step 5).
 *
 *   GET /api/categories          all shelves, with how many published books each holds
 *   GET /api/categories/:slug    one shelf by its URL slug
 *
 * Optional filter on the list:  ?type=fiction | non-fiction | educational
 */
import { Router } from "express";
import { Book } from "../models/Book.js";
import { Category, CATEGORY_TYPES } from "../models/Category.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// Query values can arrive as arrays or objects (?type[a]=b); only accept plain strings.
const str = (value) => (typeof value === "string" ? value.trim().toLowerCase().slice(0, 100) : "");

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const type = str(req.query.type);
    if (type && !CATEGORY_TYPES.includes(type)) {
      throw new ApiError(400, `type must be one of: ${CATEGORY_TYPES.join(", ")}`);
    }

    const [categories, counts] = await Promise.all([
      Category.find(type ? { type } : {}).sort({ sortOrder: 1, name: 1 }).lean(),
      // Count published books per category in one query.
      Book.aggregate([
        { $match: { isPublished: true } },
        { $unwind: "$categories" },
        { $group: { _id: "$categories", count: { $sum: 1 } } },
      ]),
    ]);

    const countById = new Map(counts.map((c) => [String(c._id), c.count]));
    res.json({
      categories: categories.map((c) => ({ ...c, bookCount: countById.get(String(c._id)) || 0 })),
    });
  })
);

router.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const category = await Category.findOne({ slug: str(req.params.slug) }).lean();
    if (!category) throw new ApiError(404, "Category not found");
    res.json({ category });
  })
);

export default router;
