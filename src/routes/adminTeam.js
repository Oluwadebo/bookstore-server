/**
 * Team management, mounted at /api/admin/team. SITE OWNER ONLY.
 * This is where the owner decides who else may help run the store.
 *
 *   GET  /api/admin/team                        pending applications, current team, recent decisions
 *   POST /api/admin/team/requests/:id/approve   make the applicant an admin
 *   POST /api/admin/team/requests/:id/reject    decline the application
 *   POST /api/admin/team/admins/:userId/remove  take admin access away
 *
 * Roles take effect immediately: every request re-reads the user's role from the
 * database, so a removed admin is locked out on their very next click.
 * The owner cannot be removed here, and there is only ever one owner
 * (ownership moves only through the server-side make-admin script).
 */
import { Router } from "express";
import { AdminRequest } from "../models/AdminRequest.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isObjectId } from "../utils/validate.js";
import { requireOwner } from "../middleware/auth.js";

const router = Router();
router.use(requireOwner); // requireAuth already ran in admin.js

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const [pending, team, recent] = await Promise.all([
      AdminRequest.find({ status: "pending" }).sort({ createdAt: 1 }).populate("user", "name email").lean(),
      User.find({ role: { $in: ["admin", "owner"] } }).select("name email role createdAt").lean(),
      AdminRequest.find({ status: { $ne: "pending" } })
        .sort({ decidedAt: -1 })
        .limit(10)
        .populate("user", "name email")
        .populate("decidedBy", "name")
        .lean(),
    ]);

    // Owner first, then admins in the order they joined.
    const admins = [...team].sort((a, b) => (a.role === b.role ? new Date(a.createdAt) - new Date(b.createdAt) : a.role === "owner" ? -1 : 1));
    res.json({ pending, admins, recent });
  })
);

/** Mark a pending application as decided. Returns null if it was already handled. */
function decide(id, status, deciderId) {
  return AdminRequest.findOneAndUpdate(
    { _id: id, status: "pending" }, // only undecided ones: two clicks can't decide twice
    { status, decidedBy: deciderId, decidedAt: new Date() },
    { new: true }
  );
}

router.post(
  "/requests/:id/approve",
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw new ApiError(404, "Application not found");
    const request = await decide(req.params.id, "approved", req.user._id);
    if (!request) throw new ApiError(409, "This application was already handled or no longer exists");

    // Only a plain customer is promoted, so this can never change the owner's role.
    await User.updateOne({ _id: request.user, role: "user" }, { role: "admin" });
    res.json({ ok: true });
  })
);

router.post(
  "/requests/:id/reject",
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw new ApiError(404, "Application not found");
    const request = await decide(req.params.id, "rejected", req.user._id);
    if (!request) throw new ApiError(409, "This application was already handled or no longer exists");
    res.json({ ok: true });
  })
);

router.post(
  "/admins/:userId/remove",
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    if (!isObjectId(userId)) throw new ApiError(404, "Admin not found");
    if (String(userId) === String(req.user._id)) throw new ApiError(400, "The owner cannot remove their own access");

    const demoted = await User.findOneAndUpdate({ _id: userId, role: "admin" }, { role: "user" }, { new: true });
    if (!demoted) throw new ApiError(404, "That person is not an admin");
    res.json({ ok: true });
  })
);

export default router;
