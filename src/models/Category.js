/**
 * Category model - the "shelf" a book sits on.
 *
 * This model is what keeps the store extensible. Fiction is the first shelf
 * type, but adding non-fiction or educational titles later only means
 * creating categories with a different `type` - no code or design changes.
 * Categories can also be nested (for example "Fantasy" inside "Fiction")
 * through the optional `parent` field.
 */
import mongoose from "mongoose";
import slugify from "slugify";

export const CATEGORY_TYPES = ["fiction", "non-fiction", "educational"];

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Category name is required"], trim: true, maxlength: 80 },
    // URL-friendly id, e.g. "science-fiction". Generated from the name.
    slug: { type: String, unique: true, lowercase: true },
    type: { type: String, enum: CATEGORY_TYPES, default: "fiction", index: true },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    // Accent colour for the category chip/card in the UI (hex).
    color: { type: String, default: "#FF6B5A", match: [/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, "Use a hex colour"] },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
    // Lower numbers appear first in menus.
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Build the slug automatically the first time a category is saved.
categorySchema.pre("validate", function (next) {
  if (!this.slug && this.name) this.slug = slugify(this.name, { lower: true, strict: true });
  next();
});

export const Category = mongoose.model("Category", categorySchema);
