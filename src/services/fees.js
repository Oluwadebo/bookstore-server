/**
 * The payment processing fee, added ON TOP of the list price so the customer covers it.
 *
 * The idea: a book listed at N10,000 is charged at N10,000 plus the processing fee. Paystack then
 * takes its fee out of that, leaving exactly the list price, and the store's commission is worked
 * out on the list price. Sellers and the store never lose money to payment fees.
 *
 * The fee is a share of the amount charged plus a fixed amount, so the customer's total has to be
 * worked BACKWARDS ("grossed up") to leave exactly the list price after Paystack's cut:
 *
 *   Paystack's local-card pricing (editable in .env): 1.5% + N100 (the N100 is waived under N2,500),
 *   and the fee never exceeds N2,000.
 *
 * Limits worth knowing: this models LOCAL CARDS in NAIRA only. Bank transfers, USSD and international
 * cards cost different amounts, so on those the real fee can be higher or lower. The difference is
 * the store's gain or loss (never the seller's). The real fee Paystack took is saved on each order
 * (providerFeeCents) so the owner can see the difference in Admin > Earnings.
 */
import { env } from "../config/env.js";

/** What Paystack takes from a charge of `amountMinor` (our model of its pricing). */
export function providerFee(amountMinor) {
  const percentPart = Math.ceil((amountMinor * env.feeBps) / 10000);
  const fixedPart = amountMinor >= env.feeFixedWaivedBelowMinor ? env.feeFixedMinor : 0;
  return Math.min(env.feeCapMinor, percentPart + fixedPart);
}

/**
 * The fee to ADD to a cart worth `subtotalMinor`, so that after Paystack's fee exactly the
 * subtotal is left. Rounded up to a whole naira so customers see neat totals.
 */
export function customerFee({ subtotalMinor, currency }) {
  if (!env.passFeesToCustomer || currency !== "NGN" || subtotalMinor <= 0) return 0;

  // Work backwards: first assume no fixed fee applies, then try with it, then the cap.
  let total = Math.ceil((subtotalMinor * 10000) / (10000 - env.feeBps));
  if (total >= env.feeFixedWaivedBelowMinor) {
    total = Math.ceil(((subtotalMinor + env.feeFixedMinor) * 10000) / (10000 - env.feeBps));
    if (providerFee(total) >= env.feeCapMinor) total = subtotalMinor + env.feeCapMinor;
  }
  total = Math.ceil(total / 100) * 100; // whole naira
  // Rounding or a threshold edge can leave us a few kobo short: nudge up until it covers.
  while (total - providerFee(total) < subtotalMinor) total += 100;

  return total - subtotalMinor;
}
