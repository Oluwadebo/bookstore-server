/**
 * Shelf (category) management for admins, mounted at /api/admin/categories.
 * The public list lives at GET /api/categories.
 *
 *   GET    /        every shelf, each marked canEdit (owner: all; admin: only the ones they created)
 *   POST   /        create a shelf
 *   PATCH  /:id     change a shelf
 *   DELETE /:id     delete an empty shelf (site owner only)
 *
 * This is how non-fiction or educational shelves are added later: create a shelf with
 * type "non-fiction" or "educational" and it appears across the site.
 * A shelf's URL slug is created once and then stays fixed, so shared links never break.
 */
import { Router } from "express";
import { Book } from "../models/Book.js";
import { Category, CATEGORY_TYPES } from "../models/Category.js";
import { ApiError } from "../utils/ApiError.js";
import { requireOwner } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isObjectId, strictText } from "../utils/validate.js";

const router = Router();

/** Validate the shelf fields from a request. `partial` leaves out missing fields. */
async function parseCategoryInput(body, { partial, selfId = null, user }) {
  if (typeof body !== "object" || body === null) throw new ApiError(400, "Invalid request");
  const has = (key) => body[key] !== undefined;
  const out = {};

  if (has("name")) {
    out.name = strictText(body.name, 80, "Shelf name");
    if (!out.name) throw new ApiError(400, "Shelf name is required");
  } else if (!partial) throw new ApiError(400, "Shelf name is required");

  if (has("type")) {
    if (!CATEGORY_TYPES.includes(body.type)) throw new ApiError(400, `Type must be one of: ${CATEGORY_TYPES.join(", ")}`);
    out.type = body.type;
  }
  if (has("description")) {
    if (typeof body.description !== "string" || body.description.length > 500) throw new ApiError(400, "Description must be under 500 characters");
    out.description = body.description.trim();
  }
  if (has("color")) {
    if (typeof body.color !== "string" || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(body.color)) throw new ApiError(400, "Choose a valid colour");
    out.color = body.color;
  }
  if (has("sortOrder")) {
    if (!Number.isInteger(body.sortOrder) || body.sortOrder < 0 || body.sortOrder > 10000) throw new ApiError(400, "Order must be a whole number");
    out.sortOrder = body.sortOrder;
  }
  if (has("parent")) {
    if (body.parent === null || body.parent === "") {
      out.parent = null;
    } else {
      if (!isObjectId(body.parent)) throw new ApiError(400, "Invalid parent shelf");
      if (selfId && String(body.parent) === String(selfId)) throw new ApiError(400, "A shelf cannot be inside itself");
      const parent = await Category.findById(body.parent).lean();
      if (!parent) throw new ApiError(400, "Parent shelf not found");
      // Admins can only nest a shelf inside a shelf of their own.
      if (user.role !== "owner" && String(parent.createdBy) !== String(user._id)) throw new ApiError(400, "You can only place a shelf inside one of your own shelves");
      // Two levels at most (shelf > sub-shelf) keeps menus simple.
      if (parent.parent) throw new ApiError(400, "Sub-shelves cannot have their own sub-shelves");
      if (selfId && (await Category.exists({ parent: selfId }))) throw new ApiError(400, "This shelf has sub-shelves, so it cannot be placed inside another shelf");
      out.parent = body.parent;
    }
  }
  return out;
}

/** Turn a duplicate-name database error into a friendly message. */
function friendly(err) {
  return err.code === 11000 ? new ApiError(409, "A shelf with that name already exists") : err;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    // Everyone sees EVERY shelf (they are public on the storefront anyway), so an admin can tell
    // that a name like "Fantasy" is taken before trying to create it. `canEdit` says which ones
    // they may change: the owner can edit all, an admin only the shelves they created.
    const owner = req.user.role === "owner";
    const [categories, counts] = await Promise.all([
      Category.find({}).sort({ sortOrder: 1, name: 1 }).lean(),
      Book.aggregate([
        { $match: { isPublished: true } },
        { $unwind: "$categories" },
        { $group: { _id: "$categories", count: { $sum: 1 } } },
      ]),
    ]);
    const countById = new Map(counts.map((row) => [String(row._id), row.count]));
    res.json({
      categories: categories.map(({ createdBy, ...shelf }) => ({
        ...shelf, // (who created it is not exposed; only whether YOU may edit it)
        bookCount: countById.get(String(shelf._id)) || 0,
        canEdit: owner || String(createdBy) === String(req.user._id),
      })),
    });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = await parseCategoryInput(req.body, { partial: false, user: req.user });
    try {
      const category = await Category.create({ ...data, createdBy: req.user._id });
      res.status(201).json({ category });
    } catch (err) {
      throw friendly(err);
    }
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = isObjectId(id) ? await Category.findById(id).lean() : null;
    // Someone else's shelf answers "not found", like books do.
    if (!existing || (req.user.role !== "owner" && String(existing.createdBy) !== String(req.user._id))) throw new ApiError(404, "Shelf not found");
    const data = await parseCategoryInput(req.body, { partial: true, selfId: id, user: req.user });
    try {
      const category = await Category.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
      res.json({ category });
    } catch (err) {
      throw friendly(err);
    }
  })
);

router.delete(
  "/:id",
  requireOwner, // only the site owner can delete a shelf
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isObjectId(id) || !(await Category.exists({ _id: id }))) throw new ApiError(404, "Shelf not found");

    const bookCount = await Book.countDocuments({ categories: id });
    if (bookCount > 0) throw new ApiError(409, `${bookCount} ${bookCount === 1 ? "book is" : "books are"} on this shelf. Move or remove them first.`);
    if (await Category.exists({ parent: id })) throw new ApiError(409, "This shelf has sub-shelves. Remove them first.");

    await Category.deleteOne({ _id: id });
    res.json({ ok: true });
  })
);

export default router;
