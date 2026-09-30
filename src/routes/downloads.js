/**
 * File downloads, mounted at /api/downloads.
 *
 *   GET /api/downloads/:token     stream the book file if the link is valid
 *
 * The token (made in routes/library.js) expires after 5 minutes. On every use we also
 * re-check that the user still owns the book and that the file path stays inside the
 * private storage folder.
 */
import { Router } from "express";
import { Book } from "../models/Book.js";
import { User } from "../models/User.js";
import { env } from "../config/env.js";
import { fileExists, resolveStoragePath } from "../storage/index.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { verifyDownloadToken } from "../utils/token.js";

const router = Router();

router.get(
  "/:token",
  asyncHandler(async (req, res, next) => {
    let payload;
    try {
      payload = verifyDownloadToken(req.params.token);
    } catch {
      throw new ApiError(410, "This download link has expired. Please go back to your library and try again.");
    }

    const [user, book] = await Promise.all([
      User.findById(payload.sub).select("library"),
      Book.findById(payload.book).select("+file.storageKey slug format"),
    ]);
    if (!user || !book || !user.library.some((id) => id.equals(book._id))) {
      throw new ApiError(403, "You do not own this book");
    }

    const key = book.file?.storageKey;
    const fullPath = resolveStoragePath(key);
    if (!fullPath || !(await fileExists(fullPath))) throw new ApiError(404, "This book's file is not available yet");

    res.set("Cache-Control", "private, no-store");
    // `root` keeps the file inside the storage folder; the browser saves it as "<slug>.<format>".
    res.download(key, `${book.slug}.${book.format}`, { root: env.storageDir, dotfiles: "deny" }, (err) => {
      if (err && !res.headersSent) next(err);
    });
  })
);

export default router;
