/**
 * Seller earnings, mounted at /api/admin/earnings (admins and the owner; scoped by role).
 *
 * MONEY MODEL. A book is sold at its LIST price. The customer also pays a processing fee on top, which
 * covers Paystack's cut (see services/fees.js), so the list price is what is left to share. The store
 * takes its commission from the list price and the seller gets the rest. The split is frozen on each
 * order line at purchase time. A seller's balance is always: earned (their share of paid orders)
 * minus payouts the owner has recorded for them. Payouts are LEDGER ENTRIES: the bank transfer
 * itself happens outside the app.
 *
 *   GET   /summary             owner: every seller + settings + fee reconciliation. admin: just themselves
 *   GET   /sales               sold lines, newest first. ?seller= (owner) ?page= ?limit=
 *   GET   /statement           one month. ?seller= (owner) ?month=YYYY-MM ?format=csv
 *   GET   /payouts             payout history. ?seller= (owner)
 *   POST  /payouts             OWNER: record a payout { seller, amountCents, currency, reference?, note? }
 *   PUT   /settings            OWNER: the default commission { commissionPercent }
 *   PATCH /sellers/:id         OWNER: one seller's own rate { commissionPercent | null }
 *
 * Admins never see customer names or emails here: only the books sold and the money.
 * (Totals are computed in code from the orders. At many tens of thousands of orders this should move
 * to a database aggregation.)
 */
import { Router } from "express";
import { env } from "../config/env.js";
import { Order } from "../models/Order.js";
import { Payout } from "../models/Payout.js";
import { Setting } from "../models/Setting.js";
import { User } from "../models/User.js";
import { getDefaultCommissionBps } from "../services/commission.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cleanString, isObjectId, strictText, toInt } from "../utils/validate.js";
import { requireOwner } from "../middleware/auth.js";

const router = Router();
const HOUR = 3600 * 1000;

// ------------------------------------------------------------------ data

/** Every sold line (one book in one paid order) that has a seller. `sellerId` limits it to one seller. */
async function soldLines(sellerId = null) {
  const orders = await Order.find({ status: "paid", "items.seller": sellerId ?? { $exists: true } })
    .select("items currency paidAt createdAt")
    .sort({ paidAt: -1 })
    .lean();

  const lines = [];
  for (const order of orders) {
    for (const item of order.items) {
      if (!item.seller || (sellerId && String(item.seller) !== String(sellerId))) continue;
      lines.push({
        orderId: String(order._id),
        paidAt: order.paidAt ?? order.createdAt,
        currency: order.currency,
        seller: String(item.seller),
        bookId: String(item.book),
        title: item.title,
        listCents: item.priceCents,
        commissionBps: item.commissionBps,
        commissionCents: item.commissionCents,
        shareCents: item.sellerShareCents,
      });
    }
  }
  return lines;
}

/** Add up lines and payouts into one row per seller and currency. */
function totalsBy(lines, payouts) {
  const rows = new Map();
  const row = (seller, currency) => {
    const key = `${seller}|${currency}`;
    if (!rows.has(key)) rows.set(key, { seller, currency, sales: 0, grossCents: 0, commissionCents: 0, earnedCents: 0, paidOutCents: 0, balanceCents: 0 });
    return rows.get(key);
  };
  for (const line of lines) {
    const r = row(line.seller, line.currency);
    r.sales += 1;
    r.grossCents += line.listCents;
    r.commissionCents += line.commissionCents;
    r.earnedCents += line.shareCents;
  }
  for (const payout of payouts) row(String(payout.seller), payout.currency).paidOutCents += payout.amountCents;
  for (const r of rows.values()) r.balanceCents = r.earnedCents - r.paidOutCents;
  return [...rows.values()];
}

/** Who is being looked at: the owner picks a seller; an admin only ever sees themselves. */
function resolveSeller(req, { required = true } = {}) {
  if (req.user.role !== "owner") return String(req.user._id);
  const id = cleanString(req.query.seller, 40);
  if (!id) {
    if (required) throw new ApiError(400, "Choose a seller");
    return null;
  }
  if (!isObjectId(id)) throw new ApiError(400, "Invalid seller");
  return id;
}

const publicRow = ({ seller, ...rest }) => rest; // (the seller id is already known to the caller)

// ------------------------------------------------------------------ summary

router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const owner = req.user.role === "owner";
    const defaultBps = await getDefaultCommissionBps();
    const onlyMe = owner ? null : String(req.user._id);

    const [lines, payouts] = await Promise.all([soldLines(onlyMe), Payout.find(onlyMe ? { seller: onlyMe } : {}).lean()]);
    const rows = totalsBy(lines, payouts);

    // Every admin is listed (even before a first sale) so the owner can set their rate.
    const sellerIds = new Set(rows.map((r) => r.seller));
    const people = await User.find(onlyMe ? { _id: onlyMe } : { $or: [{ role: "admin" }, { _id: { $in: [...sellerIds] } }] })
      .select("name email role commissionBps")
      .lean();

    const sellers = people
      .filter((person) => person.role !== "owner" || sellerIds.has(String(person._id)))
      .map((person) => ({
        _id: String(person._id),
        name: person.name,
        email: owner ? person.email : undefined,
        role: person.role,
        commissionPercent: (Number.isInteger(person.commissionBps) ? person.commissionBps : defaultBps) / 100,
        hasCustomRate: Number.isInteger(person.commissionBps),
        totals: rows.filter((r) => r.seller === String(person._id)).map(publicRow),
      }));

    const body = { sellers };
    if (owner) {
      body.settings = { commissionPercent: defaultBps / 100 };
      // The store's own commission income, per currency.
      body.commissionIncome = totalsBy(lines, []).reduce((acc, r) => {
        const entry = (acc.find((x) => x.currency === r.currency) ?? acc[acc.push({ currency: r.currency, commissionCents: 0, grossCents: 0 }) - 1]);
        entry.commissionCents += r.commissionCents;
        entry.grossCents += r.grossCents;
        return acc;
      }, []);

      // Fee reconciliation: fees charged to customers vs what Paystack actually took.
      const feeOrders = await Order.find({ status: "paid", processingFeeCents: { $gt: 0 } }).select("processingFeeCents providerFeeCents currency").lean();
      const byCurrency = new Map();
      for (const order of feeOrders) {
        const entry = byCurrency.get(order.currency) ?? { currency: order.currency, orders: 0, chargedCents: 0, knownOrders: 0, chargedOnKnownCents: 0, paystackTookCents: 0 };
        entry.orders += 1;
        entry.chargedCents += order.processingFeeCents;
        if (Number.isInteger(order.providerFeeCents)) {
          entry.knownOrders += 1;
          entry.chargedOnKnownCents += order.processingFeeCents;
          entry.paystackTookCents += order.providerFeeCents;
        }
        byCurrency.set(order.currency, entry);
      }
      body.fees = [...byCurrency.values()].map((e) => ({ ...e, differenceCents: e.chargedOnKnownCents - e.paystackTookCents }));
    }
    res.json(body);
  })
);

// ------------------------------------------------------------------ sales list

router.get(
  "/sales",
  asyncHandler(async (req, res) => {
    const sellerId = resolveSeller(req);
    const page = toInt(req.query.page, 1, 1, 10000);
    const limit = toInt(req.query.limit, 20, 1, 100);
    const [lines, payouts] = await Promise.all([soldLines(sellerId), Payout.find({ seller: sellerId }).lean()]);

    res.json({
      sales: lines.slice((page - 1) * limit, page * limit).map(({ seller, orderId, ...line }) => line),
      totals: totalsBy(lines, payouts).map(publicRow),
      page,
      limit,
      total: lines.length,
      totalPages: Math.ceil(lines.length / limit),
    });
  })
);

// ------------------------------------------------------------------ statements

/** The instants a month starts and ends on the STORE's clock (Nigeria is UTC+1). */
function monthRange(month) {
  const [year, mon] = month.split("-").map(Number);
  const offset = env.utcOffsetHours * HOUR;
  return { from: new Date(Date.UTC(year, mon - 1, 1) - offset), to: new Date(Date.UTC(year, mon, 1) - offset) };
}

const dateInStoreTime = (date) => new Date(new Date(date).getTime() + env.utcOffsetHours * HOUR).toISOString().slice(0, 10);

/** A spreadsheet cell. Text starting with = + - @ is defused so a book title can't run as a formula. */
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
const money = (cents) => (cents / 100).toFixed(2);

router.get(
  "/statement",
  asyncHandler(async (req, res) => {
    const sellerId = resolveSeller(req);
    const now = new Date(Date.now() + env.utcOffsetHours * HOUR);
    const month = cleanString(req.query.month, 7) || now.toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ApiError(400, "Month must look like 2026-10");

    const seller = await User.findById(sellerId).select("name email").lean();
    if (!seller) throw new ApiError(404, "Seller not found");

    const { from, to } = monthRange(month);
    const [allLines, allPayouts] = await Promise.all([soldLines(sellerId), Payout.find({ seller: sellerId }).sort({ paidAt: 1 }).lean()]);

    const inPeriod = (date) => new Date(date) >= from && new Date(date) < to;
    const before = (date) => new Date(date) < from;
    const lines = allLines.filter((l) => inPeriod(l.paidAt)).sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));
    const payouts = allPayouts.filter((p) => inPeriod(p.paidAt));

    // Opening balance = everything earned and paid before the month; closing = opening + this month.
    const opening = totalsBy(allLines.filter((l) => before(l.paidAt)), allPayouts.filter((p) => before(p.paidAt)));
    const thisMonth = totalsBy(lines, payouts);
    const currencies = [...new Set([...opening, ...thisMonth].map((r) => r.currency))].sort();
    const balances = currencies.map((currency) => {
      const open = opening.find((r) => r.currency === currency)?.balanceCents ?? 0;
      const row = thisMonth.find((r) => r.currency === currency) ?? { earnedCents: 0, paidOutCents: 0, sales: 0, grossCents: 0, commissionCents: 0 };
      return { currency, openingCents: open, sales: row.sales, grossCents: row.grossCents, commissionCents: row.commissionCents, earnedCents: row.earnedCents, paidOutCents: row.paidOutCents, closingCents: open + row.earnedCents - row.paidOutCents };
    });

    const statement = {
      seller: { _id: sellerId, name: seller.name, email: req.user.role === "owner" ? seller.email : undefined },
      month,
      from,
      to,
      lines: lines.map(({ seller: _s, orderId, ...line }) => ({ ...line, date: dateInStoreTime(line.paidAt), orderRef: orderId.slice(-6).toUpperCase() })),
      payouts: payouts.map((p) => ({ _id: String(p._id), date: dateInStoreTime(p.paidAt), amountCents: p.amountCents, currency: p.currency, reference: p.reference, note: p.note })),
      balances,
    };

    if (cleanString(req.query.format, 10) === "csv") {
      const rows = [
        ["Earnings statement", seller.name, month],
        [],
        ["Date", "Order", "Book", "List price", "Commission %", "Commission", "Your earnings", "Currency"],
        ...statement.lines.map((l) => [l.date, l.orderRef, l.title, money(l.listCents), (l.commissionBps / 100).toFixed(2), money(l.commissionCents), money(l.shareCents), l.currency]),
        [],
        ["Payouts"],
        ["Date", "Reference", "Note", "Amount", "Currency"],
        ...statement.payouts.map((p) => [p.date, p.reference, p.note, money(p.amountCents), p.currency]),
        [],
        ["Summary", "Currency", "Opening balance", "Sales", "Commission", "Earned", "Paid out", "Closing balance"],
        ...balances.map((b) => ["", b.currency, money(b.openingCents), money(b.grossCents), money(b.commissionCents), money(b.earnedCents), money(b.paidOutCents), money(b.closingCents)]),
      ];
      res.set("Content-Type", "text/csv; charset=utf-8");
      res.set("Content-Disposition", `attachment; filename="earnings-${month}.csv"`);
      return res.send(`\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`); // BOM so Excel reads accents
    }
    res.json({ statement });
  })
);

// ------------------------------------------------------------------ payouts

router.get(
  "/payouts",
  asyncHandler(async (req, res) => {
    const sellerId = resolveSeller(req, { required: false });
    const payouts = await Payout.find(sellerId ? { seller: sellerId } : {}).sort({ paidAt: -1 }).limit(100).populate("seller", "name").lean();
    res.json({ payouts: payouts.map((p) => ({ _id: String(p._id), seller: p.seller ? { _id: String(p.seller._id), name: p.seller.name } : null, amountCents: p.amountCents, currency: p.currency, reference: p.reference, note: p.note, paidAt: p.paidAt })) });
  })
);

router.post(
  "/payouts",
  requireOwner,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    if (!isObjectId(body.seller)) throw new ApiError(400, "Choose a seller");
    if (!Number.isInteger(body.amountCents) || body.amountCents <= 0) throw new ApiError(400, "Enter an amount greater than zero");
    const currency = strictText(body.currency ?? "", 3, "Currency").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new ApiError(400, "Currency must be a 3-letter code such as NGN");
    const reference = body.reference === undefined ? "" : strictText(body.reference, 100, "Reference");
    const note = body.note === undefined ? "" : strictText(body.note, 300, "Note");

    const seller = await User.findById(body.seller).select("_id").lean();
    if (!seller) throw new ApiError(404, "Seller not found");

    // Never record more than is owed, and never the same bank reference twice.
    const [lines, payouts] = await Promise.all([soldLines(body.seller), Payout.find({ seller: body.seller }).lean()]);
    const balance = totalsBy(lines, payouts).find((r) => r.currency === currency)?.balanceCents ?? 0;
    if (body.amountCents > balance) throw new ApiError(409, `That is more than the balance owed (${(balance / 100).toFixed(2)} ${currency}).`);
    if (reference && payouts.some((p) => p.reference === reference)) throw new ApiError(409, "A payout with that reference is already recorded for this seller.");

    const payout = await Payout.create({ seller: body.seller, amountCents: body.amountCents, currency, reference, note, recordedBy: req.user._id });
    res.status(201).json({ payout, balanceCents: balance - body.amountCents });
  })
);

// ------------------------------------------------------------------ commission settings

const toBps = (percent) => {
  if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 90) throw new ApiError(400, "Commission must be between 0 and 90 percent");
  return Math.round(percent * 100);
};

router.put(
  "/settings",
  requireOwner,
  asyncHandler(async (req, res) => {
    const bps = toBps(req.body?.commissionPercent);
    await Setting.findOneAndUpdate({ key: "commissionBps" }, { value: bps }, { upsert: true });
    res.json({ commissionPercent: bps / 100 });
  })
);

router.patch(
  "/sellers/:id",
  requireOwner,
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw new ApiError(404, "Seller not found");
    const value = req.body?.commissionPercent;
    // null removes the custom rate (back to the store default).
    const update = value === null ? { $unset: { commissionBps: "" } } : { $set: { commissionBps: toBps(value) } };
    const user = await User.findOneAndUpdate({ _id: req.params.id, role: { $ne: "owner" } }, update, { new: true });
    if (!user) throw new ApiError(404, "Seller not found");
    res.json({ ok: true, commissionPercent: Number.isInteger(user.commissionBps) ? user.commissionBps / 100 : null });
  })
);

export default router;
