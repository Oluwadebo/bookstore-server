/**
 * Shelf requests, mounted at /api/admin/shelf-requests.
 *
 * Only the OWNER creates shelves. An admin who needs a shelf that doesn't exist asks for it here,
 * and the owner approves (which creates the shelf) or declines.
 *
 *   GET    /                    owner: pending + recent decisions. admin: their own requests
 *   POST   /                    admin: ask for a new shelf { name, type?, description?, reason? }
 *   DELETE /:id                 admin: withdraw their pending request
 *   POST   /:id/approve         owner: create the shelf { color? }
 *   POST   /:id/reject          owner: decline { note? }
 *
 * Guard rails: a name that already exists (even spelled differently, like "Sci Fi" vs "Sci-Fi") or
 * is already requested is refused with a pointer to the existing one; 5 pending requests at a time;
 * 10 attempts per hour.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import slugify from "slugify";
import { Category, CATEGORY_TYPES } from "../models/Category.js";
import { ShelfRequest } from "../models/ShelfRequest.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isObjectId, strictText } from "../utils/validate.js";
import { requireOwner } from "../middleware/auth.js";

const router = Router();

/** "Sci-Fi", "sci fi" and "SciFi" all give "scifi". */
const nameKey = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");
const MAX_PENDING = 5;

const requestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    if (req.user.role === "owner") {
      const [pending, recent] = await Promise.all([
        ShelfRequest.find({ status: "pending" }).sort({ createdAt: 1 }).populate("requestedBy", "name email").lean(),
        ShelfRequest.find({ status: { $ne: "pending" } }).sort({ decidedAt: -1 }).limit(10).populate("requestedBy", "name").populate("decidedBy", "name").lean(),
      ]);
      return res.json({ pending, recent });
    }
    const requests = await ShelfRequest.find({ requestedBy: req.user._id }).sort({ createdAt: -1 }).limit(20).lean();
    res.json({ requests });
  })
);

router.post(
  "/",
  requestLimiter,
  asyncHandler(async (req, res) => {
    if (req.user.role === "owner") throw new ApiError(400, "You are the owner, so you can create the shelf directly.");

    const body = req.body ?? {};
    const name = strictText(body.name, 80, "Shelf name");
    if (!name) throw new ApiError(400, "Enter a name for the shelf");
    const key = nameKey(name);
    if (!key) throw new ApiError(400, "The shelf name needs some letters or numbers");

    const type = body.type === undefined ? "fiction" : body.type;
    if (!CATEGORY_TYPES.includes(type)) throw new ApiError(400, `Type must be one of: ${CATEGORY_TYPES.join(", ")}`);
    const description = body.description === undefined ? "" : strictText(body.description, 500, "Description");
    const reason = body.reason === undefined ? "" : strictText(body.reason, 500, "Reason");

    // Point to what already exists instead of creating a near-duplicate.
    const existing = (await Category.find({}).select("name").lean()).find((shelf) => nameKey(shelf.name) === key);
    if (existing) throw new ApiError(409, `A shelf called "${existing.name}" already exists. Put your book on that shelf.`);
    if (await ShelfRequest.exists({ nameKey: key, status: "pending" })) {
      throw new ApiError(409, "A shelf with that name has already been requested and is waiting for the owner.");
    }
    if ((await ShelfRequest.countDocuments({ requestedBy: req.user._id, status: "pending" })) >= MAX_PENDING) {
      throw new ApiError(409, `You already have ${MAX_PENDING} requests waiting. Please wait for the owner to review them.`);
    }

    const request = await ShelfRequest.create({ requestedBy: req.user._id, name, nameKey: key, type, description, reason });
    res.status(201).json({ request });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw new ApiError(404, "Request not found");
    const result = await ShelfRequest.deleteOne({ _id: req.params.id, requestedBy: req.user._id, status: "pending" });
    if (!result.deletedCount) throw new ApiError(404, "You have no pending request like that");
    res.json({ ok: true });
  })
);

router.post(
  "/:id/approve",
  requireOwner,
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw new ApiError(404, "Request not found");
    const request = await ShelfRequest.findOne({ _id: req.params.id, status: "pending" }).lean();
    if (!request) throw new ApiError(409, "This request was already handled or no longer exists");

    const color = req.body?.color;
    if (color !== undefined && !(typeof color === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color))) throw new ApiError(400, "Choose a valid colour");

    let category;
    try {
      category = await Category.create({
        name: request.name,
        type: request.type,
        description: request.description,
        ...(color && { color }),
        createdBy: req.user._id,
      });
    } catch (err) {
      if (err.code === 11000) throw new ApiError(409, "A shelf with that name already exists. Decline this request instead.");
      throw err;
    }

    // Mark it approved only if nobody decided it in the meantime.
    const decided = await ShelfRequest.findOneAndUpdate(
      { _id: request._id, status: "pending" },
      { status: "approved", decidedBy: req.user._id, decidedAt: new Date(), category: category._id },
      { new: true }
    );
    if (!decided) {
      await Category.deleteOne({ _id: category._id }); // undo: it was handled by someone else just now
      throw new ApiError(409, "This request was already handled");
    }
    res.json({ ok: true, category });
  })
);

router.post(
  "/:id/reject",
  requireOwner,
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw new ApiError(404, "Request not found");
    const note = req.body?.note === undefined ? "" : strictText(req.body.note, 300, "Note");
    const decided = await ShelfRequest.findOneAndUpdate(
      { _id: req.params.id, status: "pending" },
      { status: "rejected", decidedBy: req.user._id, decidedAt: new Date(), decisionNote: note },
      { new: true }
    );
    if (!decided) throw new ApiError(409, "This request was already handled or no longer exists");
    res.json({ ok: true });
  })
);

export default router;
