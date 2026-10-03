/**
 * Sending email (used for password resets). Works with any SMTP provider: set SMTP_HOST, SMTP_PORT,
 * SMTP_USER, SMTP_PASS and MAIL_FROM in .env.
 *
 * Without SMTP_HOST: in development the email is printed to the server console, so you can click the
 * link while testing. In production nothing is printed (a reset link in a log file would be a
 * security hole), only a warning, and the email is not sent.
 */
import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transport = null;

function getTransport() {
  if (!transport && env.smtp.host) {
    transport = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transport;
}

/** For tests: swap in a fake transport. */
export function setTransportForTests(fake) {
  transport = fake;
}

export async function sendMail({ to, subject, text, html }) {
  const active = getTransport();
  if (!active) {
    if (env.isProduction) console.warn(`Email not sent to ${to}: SMTP is not configured.`);
    else console.log(`\n[email not configured: showing it here instead]\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }
  await active.sendMail({ from: env.mailFrom, to, subject, text, html });
}
