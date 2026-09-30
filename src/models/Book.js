/**
 * Book model - one sellable digital title.
 *
 * Money is stored as integer minor units (`priceCents`) to avoid floating
 * point rounding bugs. The book file itself is never exposed publicly: only
 * a private storage key is kept here, and buyers receive short-lived
 * download links after payment (built in step 4).
 */
import mongoose from "mongoose";
import slugify from "slugify";
import { env } from "../config/env.js";

const bookSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, "Title is required"], trim: true, maxlength: 200 },
    slug: { type: String, unique: true, lowercase: true },
    authors: { type: [String], validate: [(a) => a.length > 0, "At least one author is required"] },
    description: { type: String, trim: true, maxlength: 4000, default: "" },

    priceCents: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
      validate: { validator: Number.isInteger, message: "priceCents must be a whole number" },
    },
    // New books use STORE_CURRENCY from .env unless another currency is given.
    currency: { type: String, default: () => env.storeCurrency, uppercase: true, minlength: 3, maxlength: 3 },

    coverUrl: { type: String, default: "" },
    // A book can sit on several shelves (e.g. Fantasy + Classics).
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category", index: true }],
    tags: { type: [String], default: [] },
    language: { type: String, default: "en" },
    publishedYear: Number,

    // Digital delivery details. `select: false` keeps the storage key out of
    // normal queries so it can never leak through a public API response.
    format: { type: String, enum: ["epub", "pdf"], default: "epub" },
    file: {
      storageKey: { type: String, select: false },
      sizeBytes: Number,
    },

    isPublished: { type: Boolean, default: true, index: true },
    featured: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

// Full-text index behind the keyword search. Title matches rank highest.
bookSchema.index(
  { title: "text", authors: "text", tags: "text", description: "text" },
  { weights: { title: 10, authors: 6, tags: 3, description: 1 }, name: "book_text_search" }
);

// Convenience: price in major units (e.g. 4.99) for display.
bookSchema.virtual("price").get(function () {
  return this.priceCents / 100;
});

bookSchema.pre("validate", function (next) {
  if (!this.slug && this.title) this.slug = slugify(this.title, { lower: true, strict: true });
  next();
});

export const Book = mongoose.model("Book", bookSchema);
