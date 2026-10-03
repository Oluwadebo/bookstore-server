/** The wording of the emails the store sends. */
import { env } from "../config/env.js";
import { sendMail } from "./mailer.js";

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function sendPasswordResetEmail({ user, token }) {
  const link = `${env.clientUrl}/reset-password?token=${token}`;
  const text = `Hi ${user.name},\n\nSomeone asked to reset the password for your account. To choose a new one, open this link (it works for 30 minutes):\n\n${link}\n\nIf this wasn't you, ignore this email. Your password stays the same.\n`;
  const html = `<p>Hi ${escapeHtml(user.name)},</p><p>Someone asked to reset the password for your account. To choose a new one, click the button below. It works for 30 minutes.</p><p><a href="${link}" style="display:inline-block;background:#ff6b5a;color:#1f2a55;padding:12px 24px;border-radius:999px;font-weight:bold;text-decoration:none">Choose a new password</a></p><p>If the button doesn't work, copy this link into your browser:<br>${link}</p><p>If this wasn't you, ignore this email. Your password stays the same.</p>`;
  return sendMail({ to: user.email, subject: "Reset your password", text, html });
}
