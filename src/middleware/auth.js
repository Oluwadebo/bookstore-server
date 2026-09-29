/**
 * Route guards.
 *
 *   router.get("/me", requireAuth, handler)                 signed-in users only
 *   router.post("/books", requireAuth, requireAdmin, ...)   admins only
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

/** Use AFTER requireAuth. Blocks anyone who is not an admin. */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return next(new ApiError(403, "Admins only"));
  next();
}
