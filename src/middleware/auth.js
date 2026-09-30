/**
 * Route guards.
 *
 *   router.get("/me", requireAuth, handler)                 signed-in users only
 *   router.post("/books", requireAuth, requireAdmin, ...)   admins (and the owner)
 *   router.delete("/books/:id", requireAuth, requireOwner)  the site owner only
 *
 * requireAuth reads the login cookie, verifies it, loads the user from the
 * database (so deleted or demoted accounts lose access immediately) and
 * exposes it as `req.user`.
 */
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { COOKIE_NAME, verifyToken } from "../utils/token.js";

export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) throw new ApiError(401, "Please sign in to continue");

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new ApiError(401, "Your session has expired. Please sign in again");
  }

  const user = await User.findById(payload.sub);
  if (!user) throw new ApiError(401, "Account not found");

  req.user = user;
  next();
});

/** Use AFTER requireAuth. Lets in admins and the owner; blocks everyone else. */
export function requireAdmin(req, res, next) {
  if (!["admin", "owner"].includes(req.user?.role)) return next(new ApiError(403, "Admins only"));
  next();
}

/** Use AFTER requireAuth. Only the site owner gets through: the top level of authority. */
export function requireOwner(req, res, next) {
  if (req.user?.role !== "owner") return next(new ApiError(403, "Only the site owner can do this"));
  next();
}
