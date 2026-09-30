/**
 * "My Library": books the customer has bought, mounted at /api/library.
 *
 *   GET  /api/library                   the customer's books
 *   POST /api/library/:bookId/link      get a download link that works for 5 minutes
 *
 * Book files are never public. The link is created only for an owner, expires quickly,
 * and is checked again when it is used (see routes/downloads.js).
 */
import { Router } from "express";
import { Book } from "../models/Book.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { signDownloadToken } from "../utils/token.js";
import { isObjectId } from "../utils/validate.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const books = await Book.find({ _id: { $in: req.user.library } }, { description: 0 }).sort({ title: 1 }).lean();
    res.json({ books });
  })
);

router.post(
  "/:bookId/link",
  asyncHandler(async (req, res) => {
    const { bookId } = req.params;
    if (!isObjectId(bookId)) throw new ApiError(400, "Invalid book id");
    if (!req.user.library.some((id) => String(id) === bookId)) throw new ApiError(403, "You do not own this book");

    const book = await Book.findById(bookId).select("+file.storageKey").lean();
    if (!book?.file?.storageKey) throw new ApiError(404, "This book's file is not available yet. Please contact the store.");

    res.json({ url: `/api/downloads/${signDownloadToken(req.user._id, bookId)}` });
  })
);

export default router;
