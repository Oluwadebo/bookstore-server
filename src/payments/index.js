/**
 * Picks the active payment provider from PAYMENT_PROVIDER in .env.
 * To add a gateway: create ./yourgateway.js with the same interface as
 * ./paystack.js and add it to the list below.
 */
import dns from "dns";
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
dns.setDefaultResultOrder("ipv4first");
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { paystackProvider } from "./paystack.js";

const PROVIDERS = { paystack: paystackProvider };

export function getProvider() {
  const provider = PROVIDERS[env.paymentProvider];
  if (!provider) throw new ApiError(503, `Unknown payment provider "${env.paymentProvider}"`);
  return provider;
}
