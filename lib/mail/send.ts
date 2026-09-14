/**
 * Sending an email, which Hearthlight does for exactly one reason.
 *
 * Password resets, and only for accounts that hold an address. Nothing else in
 * this app emails anybody: there are no digests, no notifications, no "your
 * adventure is waiting" nudges. A family sitting in one house does not need to
 * be emailed about a game they are about to play together, and a service for
 * children should collect and use the least it can.
 *
 * ## Configuration, and what happens without it
 *
 * One connection URL rather than five separate variables, because every
 * provider gives you exactly this string and splitting it up is an invitation
 * to get one field wrong:
 *
 *   SMTP_URL="smtps://user:password@smtp.example.com:465"
 *   MAIL_FROM="Hearthlight <hearth@yourdomain>"
 *
 * Works with anything that speaks SMTP — a Gmail app password, Fastmail, SES,
 * Resend's SMTP bridge — so nothing here is tied to a provider.
 *
 * **Unconfigured, this is off rather than broken.** `isConfigured` is false and
 * the screens say to ask whoever runs Hearthlight, which is true and actionable.
 * The alternative — pretending to send and silently dropping it — would leave
 * somebody waiting for an email that was never going to arrive.
 */

import nodemailer, { type Transporter } from "nodemailer";

export function isConfigured(): boolean {
  return Boolean(process.env.SMTP_URL?.trim() && process.env.MAIL_FROM?.trim());
}

let cached: Transporter | null = null;

function transport(): Transporter {
  // The URL already carries host, port, credentials and TLS choice. Pooling is
  // the one thing it cannot say, and it is worth saying: reconnecting per
  // message is slow, and on providers that count connections rather than
  // messages it is also expensive.
  cached ??= nodemailer.createTransport({ url: process.env.SMTP_URL!.trim(), pool: true });
  return cached;
}

export type Mail = { to: string; subject: string; text: string };

/**
 * Sends one message, and says whether it went.
 *
 * Returns a result rather than throwing, because every caller has a sensible
 * thing to do with "no" and none of them should turn a mail outage into an
 * error page. The one caller today deliberately tells the person the same thing
 * either way, so as not to reveal which addresses have accounts — the *log* is
 * where a failure is visible, and it is the administrator who needs to see it.
 */
export async function sendMail(mail: Mail): Promise<{ sent: boolean; reason?: string }> {
  if (!isConfigured()) return { sent: false, reason: "SMTP_URL and MAIL_FROM are not set" };

  try {
    await transport().sendMail({
      from: process.env.MAIL_FROM!.trim(),
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });
    return { sent: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // Loud in the log and quiet on the screen. Somebody waiting for a reset
    // email needs whoever runs the installation to see this.
    console.error(`[mail] could not send "${mail.subject}": ${reason}`);
    return { sent: false, reason };
  }
}
