/**
 * Book catalogue routes, mounted at /api/books. Public, read-only.
 *
 *   GET /api/books           browse and search
 *   GET /api/books/:slug     one book, plus related titles
 *
 * Query options for the list:
 *   search    keyword(s), matched against title, author, tags and description
 *   category  a category slug (also includes its sub-categories)
 *   type      fiction | non-fiction | educational
 *   featured  "true" to return only featured books
 *   sort      relevance (search only) | newest | price-asc | price-desc | title
 *   page      1, 2, 3...   (default 1)
 *   limit     books per page, 1-48 (default 12)
 *
 * Only published books are ever returned, and private file details never are.
 */
import { Router } from "express";
import { Book } from "../models/Book.js";
import { Category, CATEGORY_TYPES } from "../models/Category.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// Which fields of each shelf to include on a book. Enough to draw a chip.
const CATEGORY_FIELDS = "name slug color type";

// Sort options. `_id` is a tiebreaker so pages never repeat or skip books.
const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  "price-asc": { priceCents: 1, _id: 1 },
  "price-desc": { priceCents: -1, _id: 1 },
  title: { title: 1, _id: 1 },
};

/** Accept only plain strings from the query string (blocks ?search[$ne]=x tricks). */
const str = (value, max = 100) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Parse an integer and clamp it into a safe range. */
function toInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : Math.min(Math.max(n, min), max);
}

/** Make user text safe to use inside a regular expression. */
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Work out which category ids a request refers to. A slug matches that shelf
 * and its children; a type matches every shelf of that type.
 */
async function categoryIds(slug, type) {
  const criteria = {};
  if (slug) criteria.slug = slug;
  if (type) criteria.type = type;

  const matched = await Category.find(criteria).select("_id").lean();
  if (slug && matched.length === 0) throw new ApiError(404, "Category not found");

  const ids = matched.map((c) => c._id);
  const children = await Category.find({ parent: { $in: ids } }).select("_id").lean();
  return [...ids, ...children.map((c) => c._id)];
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const search = str(req.query.search);
    const slug = str(req.query.category).toLowerCase();
    const type = str(req.query.type).toLowerCase();
    const sortKey = str(req.query.sort);
    const page = toInt(req.query.page, 1, 1, 10000);
    const limit = toInt(req.query.limit, 12, 1, 48);

    if (type && !CATEGORY_TYPES.includes(type)) {
      throw new ApiError(400, `type must be one of: ${CATEGORY_TYPES.join(", ")}`);
    }
    if (sortKey && sortKey !== "relevance" && !SORTS[sortKey]) {
      throw new ApiError(400, "Unknown sort option");
    }

    // Filters that apply to every request.
    const baseFilter = { isPublished: true };
    if (req.query.featured === "true") baseFilter.featured = true;
    if (slug || type) baseFilter.categories = { $in: await categoryIds(slug, type) };

    /** Run one query (with paging) and count the total matches. */
    async function run(extraFilter, rankByRelevance) {
      const filter = { ...baseFilter, ...extraFilter };
      // Lists don't need the long description. `score` is MongoDB's text-match quality.
      const projection = rankByRelevance
        ? { description: 0, score: { $meta: "textScore" } }
        : { description: 0 };
      const sort = rankByRelevance ? { score: { $meta: "textScore" } } : SORTS[sortKey] || SORTS.newest;

      const [books, total] = await Promise.all([
        Book.find(filter, projection)
          .sort(sort)
          .skip((page - 1) * limit)
          .limit(limit)
          .populate("categories", CATEGORY_FIELDS)
          .lean(),
        Book.countDocuments(filter),
      ]);
      return { books, total };
    }

    let result;
    if (search) {
      // 1st attempt: MongoDB full-text search (word based, ranked by relevance).
      const rank = !sortKey || sortKey === "relevance";
      result = await run({ $text: { $search: search } }, rank);

      // 2nd attempt: partial matching, so "holm" still finds "Sherlock Holmes".
      if (result.total === 0) {
        const partial = new RegExp(escapeRegex(search), "i");
        result = await run({ $or: [{ title: partial }, { authors: partial }, { tags: partial }] }, false);
      }
    } else {
      result = await run({}, false);
    }

    res.json({
      books: result.books,
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
    });
  })
);

router.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const book = await Book.findOne({ slug: str(req.params.slug).toLowerCase(), isPublished: true })
      .populate("categories", CATEGORY_FIELDS)
      .lean();
    if (!book) throw new ApiError(404, "Book not found");

    // "You might also like": other books sharing at least one shelf.
    const related = await Book.find(
      {
        _id: { $ne: book._id },
        isPublished: true,
        categories: { $in: book.categories.map((c) => c._id) },
      },
      { description: 0 }
    )
      .sort({ featured: -1, createdAt: -1 })
      .limit(4)
      .populate("categories", CATEGORY_FIELDS)
      .lean();

    res.json({ book, related });
  })
);

export default router;
