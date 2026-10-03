/**
 * Paystack payment adapter.
 *
 * Every payment provider exposes the same small interface, so the rest of the
 * app never talks to Paystack directly. To support another gateway (Stripe,
 * Flutterwave...), write a file with the same shape and register it in
 * ./index.js. Nothing else changes.
 *
 *   name              provider id stored on orders
 *   signatureHeader   header that carries the webhook signature
 *   createCheckout()  start a payment, returns the hosted payment page URL
 *   verifyPayment()   ask the provider what happened to a payment
 *   parseWebhook()    check a webhook's signature and normalise its data
 *
 * Amounts are always in the smallest currency unit (kobo for NGN, cents for USD),
 * which is exactly how prices are stored in this app.
 * Docs: https://paystack.com/docs/api/
 */
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

const API_URL = "https://api.paystack.co";

/** Call the Paystack API and return its `data` field, or throw a clean ApiError. */
async function callPaystack(path, options = {}) {
  if (!env.paystackSecretKey) throw new ApiError(503, "Payments are not configured yet");

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${env.paystackSecretKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000), // never hang a customer's checkout
    });
  } catch {
    throw new ApiError(502, "Could not reach the payment provider. Please try again.");
  }

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.status) {
    console.error("Paystack error:", response.status, body?.message);
    throw new ApiError(502, body?.message ? `Payment provider: ${body.message}` : "Payment provider error");
  }
  return body.data;
}

export const paystackProvider = {
  name: "paystack",
  signatureHeader: "x-paystack-signature",

  /** Create a payment and return where to send the customer. */
  async createCheckout({ reference, email, amountMinor, currency, callbackUrl, orderId }) {
    const data = await callPaystack("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email,
        amount: amountMinor,
        currency,
        reference,
        callback_url: callbackUrl, // Paystack sends the customer back here after paying
        metadata: { orderId },
      }),
    });
    return { url: data.authorization_url, reference: data.reference };
  },

  /** Look up a payment. Returns { status: "paid" | "failed" | "pending", amountMinor, currency }. */
  async verifyPayment(reference) {
    const data = await callPaystack(`/transaction/verify/${encodeURIComponent(reference)}`);
    return {
      status: data.status === "success" ? "paid" : data.status === "failed" ? "failed" : "pending",
      amountMinor: data.amount,
      currency: data.currency,
      feesMinor: Number.isInteger(data.fees) ? data.fees : undefined, // what Paystack actually charged
    };
  },

  /**
   * Validate a webhook. Paystack signs the raw request body with your secret key
   * (HMAC SHA-512) and sends the result in the x-paystack-signature header.
   * Returns a normalised payment for successful charges, null for events we
   * ignore, and throws if the signature is wrong (so forged requests are rejected).
   */
  parseWebhook(rawBody, signature) {
    if (!env.paystackSecretKey) throw new ApiError(503, "Payments are not configured yet");
    if (!Buffer.isBuffer(rawBody)) throw new ApiError(400, "Invalid webhook body");

    const expected = crypto.createHmac("sha512", env.paystackSecretKey).update(rawBody).digest();
    const given = Buffer.from(String(signature || ""), "hex");
    // timingSafeEqual avoids leaking information through response timing.
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      throw new ApiError(401, "Invalid signature");
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new ApiError(400, "Invalid webhook body");
    }
    if (event.event !== "charge.success" || !event.data?.reference) return null;

    return {
      reference: event.data.reference,
      status: "paid",
      amountMinor: event.data.amount,
      currency: event.data.currency,
      feesMinor: Number.isInteger(event.data.fees) ? event.data.fees : undefined,
    };
  },
};
