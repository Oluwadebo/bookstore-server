/**
 * Payment webhook, mounted at /api/payments.
 *
 *   POST /api/payments/webhook    called by the payment provider (not by the website)
 *
 * The provider calls this from its own servers whenever a payment succeeds, so the
 * customer gets their books even if they close the browser before returning to the site.
 * Configure this URL in the Paystack dashboard (Settings > API Keys & Webhooks).
 *
 * The route reads the RAW request body because the signature is calculated over the
 * exact bytes sent. That is why it is mounted before express.json() in app.js.
 */
import express, { Router } from "express";
import { Order } from "../models/Order.js";
import { getProvider } from "../payments/index.js";
import { settleOrder } from "../services/orders.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.post(
  "/webhook",
  express.raw({ type: () => true, limit: "1mb" }),
  asyncHandler(async (req, res) => {
    const provider = getProvider();
    // Throws (401) if the signature is missing or wrong, so forged calls do nothing.
    const payment = provider.parseWebhook(req.body, req.get(provider.signatureHeader));

    if (payment) {
      const order = await Order.findOne({ providerRef: payment.reference });
      if (order) await settleOrder(order, payment);
    }

    // Always answer 200 quickly for valid webhooks so the provider stops retrying.
    res.sendStatus(200);
  })
);

export default router;
