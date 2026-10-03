/**
 * Commission: the store's cut of each seller's LIST price.
 *
 * - The default rate (10% to start) lives in the database so the owner can change it in the admin
 *   area; COMMISSION_PERCENT in .env is the starting value.
 * - A seller can have their own rate, which overrides the default.
 * - The rate is frozen on each order item at purchase time. Changing it later affects only future sales.
 */
import { env } from "../config/env.js";
import { Setting } from "../models/Setting.js";

export async function getDefaultCommissionBps() {
  const saved = await Setting.findOne({ key: "commissionBps" }).lean();
  return Number.isInteger(saved?.value) ? saved.value : env.commissionBps;
}

/** The store's cut of a list price, rounded to the nearest minor unit. */
export const commissionFor = (priceCents, bps) => Math.round((priceCents * bps) / 10000);

/**
 * Work out the seller/commission fields for one order line. Returns {} for books with no seller
 * (the owner's own books), which means the owner keeps the whole price.
 */
export function splitForItem({ priceCents, creator, defaultBps }) {
  if (!creator || creator.role === "owner") return {};
  const bps = Number.isInteger(creator.commissionBps) ? creator.commissionBps : defaultBps;
  const commissionCents = commissionFor(priceCents, bps);
  return { seller: creator._id, commissionBps: bps, commissionCents, sellerShareCents: priceCents - commissionCents };
}
