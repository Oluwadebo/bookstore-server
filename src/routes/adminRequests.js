/**
 * Applying for admin access, mounted at /api/admin-requests. Any signed-in customer.
 *
 *   POST   /api/admin-requests        apply { message? }
 *   GET    /api/admin-requests/mine   my latest application, or { request: null }
 *   DELETE /api/admin-requests/mine   withdraw my pending application
 *
 * Applying does NOT give any access. The site owner reviews applications
 * (see routes/adminTeam.js). Guards against pestering the owner:
 *  - one pending application at a time
 *  - after a decline, wait 7 days before applying again
 *  - at most 5 attempts per hour per IP
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { AdminRequest } from "../models/AdminRequest.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { strictText } from "../utils/validate.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

router.post(
  "/",
  applyLimiter,
  asyncHandler(async (req, res) => {
    if (req.user.role !== "user") throw new ApiError(409, "You already have admin access");

    const message = req.body?.message === undefined ? "" : strictText(req.body.message, 500, "Message");

    if (await AdminRequest.exists({ user: req.user._id, status: "pending" })) {
      throw new ApiError(409, "You already have an application waiting for the owner's review");
    }

    const lastDeclined = await AdminRequest.findOne({ user: req.user._id, status: "rejected" }).sort({ decidedAt: -1 }).lean();
    if (lastDeclined && Date.now() - new Date(lastDeclined.decidedAt).getTime() < COOLDOWN_MS) {
      const again = new Date(new Date(lastDeclined.decidedAt).getTime() + COOLDOWN_MS);
      throw new ApiError(409, `Your last application was declined. You can apply again after ${again.toDateString()}.`);
    }

    const request = await AdminRequest.create({ user: req.user._id, message });
    res.status(201).json({ request });
  })
);

router.get(
  "/mine",
  asyncHandler(async (req, res) => {
    const request = await AdminRequest.findOne({ user: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ request: request ?? null });
  })
);

router.delete(
  "/mine",
  asyncHandler(async (req, res) => {
    const result = await AdminRequest.deleteOne({ user: req.user._id, status: "pending" });
    if (!result.deletedCount) throw new ApiError(404, "You have no pending application");
    res.json({ ok: true });
  })
);

export default router;
