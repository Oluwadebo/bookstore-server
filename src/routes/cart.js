/**
 * Shopping cart for signed-in customers, mounted at /api/cart.
 * (Guests keep their cart in the browser; it is merged into this one at login.)
 *
 *   GET    /api/cart              current cart
 *   POST   /api/cart              add { bookId } or merge { bookIds: [...] }
 *   DELETE /api/cart/:bookId      remove one book
 *
 * Every response is { cart: { items, totalCents, currency, mixedCurrencies } }.
 * Prices always come from the database, never from the browser.
 */
import { Router } from "express";
import { Book } from "../models/Book.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isObjectId } from "../utils/validate.js";
import { customerFee } from "../services/fees.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const MAX_IDS = 50;

/** Load the cart's books (in the order they were added) and work out the total. */
async function buildCart(user) {
  const books = await Book.find({ _id: { $in: user.cart }, isPublished: true }, { description: 0 }).lean();
  const byId = new Map(books.map((book) => [String(book._id), book]));
  const items = user.cart.map((id) => byId.get(String(id))).filter(Boolean);

  const currencies = [...new Set(items.map((book) => book.currency))];
  const totalCents = items.reduce((sum, book) => sum + book.priceCents, 0);
  const currency = currencies.length === 1 ? currencies[0] : null;
  // The payment processing fee, added on top of the list prices (see services/fees.js).
  const processingFeeCents = currency ? customerFee({ subtotalMinor: totalCents, currency }) : 0;
  return {
    items,
    totalCents, // the list prices added up
    processingFeeCents,
    payableCents: totalCents + processingFeeCents, // what the customer will be charged
    // A payment can only be in one currency, so a mixed cart cannot be checked out.
    currency,
    mixedCurrencies: currencies.length > 1,
  };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ cart: await buildCart(req.user) });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { bookId, bookIds } = req.body ?? {};
    const single = bookId !== undefined;
    const ids = single ? [bookId] : bookIds;

    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS || !ids.every(isObjectId)) {
      throw new ApiError(400, `Provide a valid bookId, or up to ${MAX_IDS} bookIds`);
    }

    const owned = new Set(req.user.library.map(String));
    if (single && owned.has(String(bookId))) throw new ApiError(409, "You already own this book");

    // Only real, published books can be added. Unknown ids are ignored quietly.
    const books = await Book.find({ _id: { $in: ids }, isPublished: true }).select("_id").lean();
    if (single && books.length === 0) throw new ApiError(404, "Book not found");

    const addable = books.map((book) => book._id).filter((id) => !owned.has(String(id)));
    // $addToSet makes adding the same book twice harmless.
    const user = await User.findByIdAndUpdate(req.user._id, { $addToSet: { cart: { $each: addable } } }, { new: true });

    res.json({ cart: await buildCart(user) });
  })
);

router.delete(
  "/:bookId",
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.bookId)) throw new ApiError(400, "Invalid book id");
    const user = await User.findByIdAndUpdate(req.user._id, { $pull: { cart: req.params.bookId } }, { new: true });
    res.json({ cart: await buildCart(user) });
  })
);

export default router;
