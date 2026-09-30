/**
 * Book management for admins, mounted at /api/admin/books (admin only; see admin.js).
 *
 *   GET    /                list every book, drafts included. ?search= ?status=published|draft ?page=
 *   GET    /:id             one book with all its details
 *   POST   /                create a book (starts as a draft)
 *   PATCH  /:id             change any of its details
 *   DELETE /:id             delete a book nobody owns (site owner only)
 *   POST   /:id/file        upload the sellable file (PDF or EPUB), field name "file"
 *   POST   /:id/cover       upload the cover image (JPEG/PNG/WebP), field name "cover"
 *
 * Rules that protect customers:
 *  - A book can only be published once its file is uploaded.
 *  - A book someone has bought cannot be deleted (unpublish it instead), so nobody
 *    loses access to something they paid for.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import slugify from "slugify";
import { env } from "../config/env.js";
import { Book } from "../models/Book.js";
import { Category } from "../models/Category.js";
import { Order } from "../models/Order.js";
import { User } from "../models/User.js";
import { moveFile, removeStoredFile } from "../storage/index.js";
import { sniffBookFormat, sniffImage } from "../storage/fileTypes.js";
import { ApiError } from "../utils/ApiError.js";
import { requireOwner } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cleanString, escapeRegex, isObjectId, strictText, toInt } from "../utils/validate.js";

const router = Router();

const COVER_URL_PREFIX = "/api/covers/";
const MAX_COVER_BYTES = 2 * 1024 * 1024;
const randomId = () => crypto.randomBytes(6).toString("hex");

// ---------------------------------------------------------------- helpers

/** Shape a book for the admin screens: never expose the private storage key. */
function toAdminBook(book) {
  const { file, ...rest } = book;
  return { ...rest, hasFile: Boolean(file?.storageKey), fileSizeBytes: file?.sizeBytes ?? null };
}

const plain = (doc) => (doc?.toObject ? doc.toObject() : doc);

/** Load a book (with its private file key) or throw 404. */
async function loadBook(id) {
  const book = isObjectId(id) ? await Book.findById(id).select("+file.storageKey") : null;
  if (!book) throw new ApiError(404, "Book not found");
  return plain(book);
}

/** A URL-friendly, unique slug: "dracula", then "dracula-2", "dracula-3"... */
async function uniqueSlug(title) {
  const base = slugify(title, { lower: true, strict: true }) || "book";
  let slug = base;
  for (let n = 2; await Book.exists({ slug }); n++) slug = `${base}-${n}`;
  return slug;
}

/** Accept an array or a comma-separated string; trim, drop empties, enforce limits. */
function toList(value, maxItems, maxLength, label) {
  const items = (Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : null);
  if (!items) throw new ApiError(400, `${label} must be a list`);
  const cleaned = items.map((item) => cleanString(item, maxLength + 1)).filter(Boolean);
  if (cleaned.length > maxItems) throw new ApiError(400, `${label}: at most ${maxItems} items`);
  if (cleaned.some((item) => item.length > maxLength)) throw new ApiError(400, `${label}: each item must be under ${maxLength} characters`);
  return cleaned;
}

/**
 * Validate and clean the book fields from a request. Only known fields are kept, so
 * nobody can set things like the file location through this path. With `partial`,
 * missing fields are simply left alone (used by PATCH).
 */
async function parseBookInput(body, { partial }) {
  if (typeof body !== "object" || body === null) throw new ApiError(400, "Invalid request");
  const has = (key) => body[key] !== undefined;
  const out = {};

  if (has("title")) {
    out.title = strictText(body.title, 200, "Title");
    if (!out.title) throw new ApiError(400, "Title is required");
  } else if (!partial) throw new ApiError(400, "Title is required");

  if (has("authors")) {
    out.authors = toList(body.authors, 10, 100, "Authors");
    if (out.authors.length === 0) throw new ApiError(400, "At least one author is required");
  } else if (!partial) throw new ApiError(400, "At least one author is required");

  if (has("priceCents")) {
    if (!Number.isInteger(body.priceCents) || body.priceCents < 0 || body.priceCents > 1_000_000_000) {
      throw new ApiError(400, "Price must be zero or more");
    }
    out.priceCents = body.priceCents;
  } else if (!partial) throw new ApiError(400, "Price is required");

  if (has("description")) {
    if (typeof body.description !== "string" || body.description.length > 4000) throw new ApiError(400, "Description must be under 4000 characters");
    out.description = body.description.trim();
  }
  if (has("currency")) {
    out.currency = strictText(body.currency, 3, "Currency").toUpperCase();
    if (!/^[A-Z]{3}$/.test(out.currency)) throw new ApiError(400, "Currency must be a 3-letter code such as NGN or USD");
  }
  if (has("tags")) out.tags = toList(body.tags, 20, 40, "Tags").map((tag) => tag.toLowerCase());
  if (has("language")) {
    out.language = strictText(body.language, 10, "Language").toLowerCase();
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,4})?$/.test(out.language)) throw new ApiError(400, "Language must be a code such as en or fr");
  }
  if (has("publishedYear")) {
    const year = body.publishedYear;
    if (year !== null && (!Number.isInteger(year) || year < 1 || year > new Date().getFullYear() + 1)) throw new ApiError(400, "Enter a valid year");
    out.publishedYear = year;
  }
  for (const flag of ["isPublished", "featured"]) {
    if (has(flag)) {
      if (typeof body[flag] !== "boolean") throw new ApiError(400, `${flag} must be true or false`);
      out[flag] = body[flag];
    }
  }
  if (has("coverUrl")) {
    const url = typeof body.coverUrl === "string" ? body.coverUrl.trim() : null;
    // "" removes the cover. Otherwise it must be our own upload or a secure external image.
    if (url === null || (url !== "" && !url.startsWith(COVER_URL_PREFIX) && !/^https:\/\/\S+$/.test(url)) || url.length > 500) {
      throw new ApiError(400, "Cover must be an https image link, or an uploaded image");
    }
    out.coverUrl = url;
  }
  if (has("categories")) {
    const ids = body.categories;
    if (!Array.isArray(ids) || ids.length > 10 || !ids.every(isObjectId)) throw new ApiError(400, "Choose up to 10 shelves");
    if (ids.length > 0 && (await Category.countDocuments({ _id: { $in: ids } })) !== new Set(ids).size) {
      throw new ApiError(400, "One of the chosen shelves does not exist");
    }
    out.categories = [...new Set(ids)];
  }
  return out;
}

/** Delete an uploaded cover that belongs to us (never touches external links). */
async function removeLocalCover(coverUrl) {
  if (typeof coverUrl === "string" && coverUrl.startsWith(COVER_URL_PREFIX)) {
    await fs.rm(path.join(env.coversDir, path.basename(coverUrl)), { force: true });
  }
}

/** Run a multer upload as a promise and turn its errors into clear messages. */
function runUpload(middleware, req, res, maxMb) {
  return new Promise((resolve, reject) => {
    middleware(req, res, (err) => {
      if (!err) return resolve();
      if (err.code === "LIMIT_FILE_SIZE") return reject(new ApiError(413, `That file is too large (maximum ${maxMb} MB)`));
      reject(new ApiError(400, "The upload could not be read. Please try again."));
    });
  });
}

// Book files wait in a temp folder until their type is verified; covers are small so stay in memory.
const bookUpload = multer({ dest: env.tmpDir, limits: { fileSize: env.maxBookFileMb * 1024 * 1024, files: 1 } });
const coverUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_COVER_BYTES, files: 1 } });

// ---------------------------------------------------------------- routes

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const search = cleanString(req.query.search);
    const status = cleanString(req.query.status);
    const page = toInt(req.query.page, 1, 1, 10000);
    const limit = toInt(req.query.limit, 20, 1, 100);

    const filter = {};
    if (status === "published") filter.isPublished = true;
    if (status === "draft") filter.isPublished = false;
    if (search) {
      const partial = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ title: partial }, { authors: partial }];
    }

    const [books, total] = await Promise.all([
      Book.find(filter).select("+file.storageKey").sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Book.countDocuments(filter),
    ]);
    res.json({ books: books.map(toAdminBook), page, limit, total, totalPages: Math.ceil(total / limit) });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json({ book: toAdminBook(await loadBook(req.params.id)) });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = await parseBookInput(req.body, { partial: false });
    data.slug = await uniqueSlug(data.title);
    data.isPublished = false; // drafts until a file is uploaded
    const book = await Book.create(data);
    res.status(201).json({ book: toAdminBook(plain(book)) });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const current = await loadBook(req.params.id);
    const data = await parseBookInput(req.body, { partial: true });

    if (data.isPublished === true && !current.file?.storageKey) {
      throw new ApiError(400, "Upload the book file before publishing, otherwise customers could not receive it");
    }

    const updated = plain(await Book.findByIdAndUpdate(current._id, { $set: data }, { new: true, runValidators: true }));
    if (data.coverUrl !== undefined && data.coverUrl !== current.coverUrl) await removeLocalCover(current.coverUrl);

    // The update result hides the private file key, so carry over the file info we already loaded.
    res.json({ book: toAdminBook({ ...updated, file: current.file }) });
  })
);

router.delete(
  "/:id",
  requireOwner, // admins can unpublish; only the owner can delete
  asyncHandler(async (req, res) => {
    const book = await loadBook(req.params.id);

    const owned = (await User.exists({ library: book._id })) || (await Order.exists({ "items.book": book._id, status: "paid" }));
    if (owned) throw new ApiError(409, "Customers have bought this book, so it cannot be deleted. Unpublish it instead.");

    await Book.deleteOne({ _id: book._id });
    await User.updateMany({ cart: book._id }, { $pull: { cart: book._id } });
    await removeStoredFile(book.file?.storageKey);
    await removeLocalCover(book.coverUrl);
    res.json({ ok: true });
  })
);

router.post(
  "/:id/file",
  asyncHandler(async (req, res) => {
    const book = await loadBook(req.params.id);
    await runUpload(bookUpload.single("file"), req, res, env.maxBookFileMb);
    if (!req.file) throw new ApiError(400, "Choose a PDF or EPUB file");

    try {
      const format = await sniffBookFormat(req.file.path);
      if (!format) throw new ApiError(400, "That file is not a valid PDF or EPUB");

      const key = `${book.slug}-${randomId()}.${format}`;
      await fs.mkdir(env.storageDir, { recursive: true });
      await moveFile(req.file.path, path.join(env.storageDir, key));

      const updated = plain(
        await Book.findByIdAndUpdate(book._id, { $set: { format, file: { storageKey: key, sizeBytes: req.file.size } } }, { new: true })
      );
      // Customers who already own this book get the new file from now on.
      await removeStoredFile(book.file?.storageKey);

      res.json({ book: toAdminBook({ ...updated, file: { storageKey: key, sizeBytes: req.file.size } }) });
    } finally {
      await fs.rm(req.file.path, { force: true }); // no-op once the file was moved
    }
  })
);

router.post(
  "/:id/cover",
  asyncHandler(async (req, res) => {
    const book = await loadBook(req.params.id);
    await runUpload(coverUpload.single("cover"), req, res, MAX_COVER_BYTES / 1024 / 1024);
    if (!req.file) throw new ApiError(400, "Choose an image");

    const type = sniffImage(req.file.buffer);
    if (!type) throw new ApiError(400, "Cover must be a JPEG, PNG or WebP image");

    const name = `cover-${randomId()}.${type.ext}`;
    await fs.mkdir(env.coversDir, { recursive: true });
    await fs.writeFile(path.join(env.coversDir, name), req.file.buffer);

    const updated = plain(await Book.findByIdAndUpdate(book._id, { $set: { coverUrl: `${COVER_URL_PREFIX}${name}` } }, { new: true }));
    await removeLocalCover(book.coverUrl);

    res.json({ book: toAdminBook({ ...updated, file: book.file }) });
  })
);

export default router;
