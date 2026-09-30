import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";

import type { Env } from "../../config/env.schema";

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Outbound email.
 *
 * Email is load-bearing for authorization here, not a nicety: an invitation is
 * addressed to an email, so only the owner of that inbox may set the password
 * of the account that accepts it (see PasswordLinks). That is why production refuses to boot without SMTP (see
 * validateEnv) instead of degrading to "log and carry on".
 *
 * Transports:
 *  - SMTP_HOST set          → that server.
 *  - local, SMTP_HOST unset → the Mailpit container on 127.0.0.1:SMTP_PORT.
 *  - NODE_ENV=test          → nothing leaves the process; messages are kept in
 *                             `outbox` so tests can read links out of them.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly isTest: boolean;
  /** Test transport only: every message sent, newest last. */
  readonly outbox: OutgoingMail[] = [];

  constructor(config: ConfigService<Env, true>) {
    this.from = config.get("MAIL_FROM", { infer: true }) || "TENDYY <no-reply@tendyy.local>";
    this.isTest = config.get("NODE_ENV", { infer: true }) === "test";

    if (this.isTest) {
      this.transporter = createTransport({ jsonTransport: true });
      return;
    }

    const user = config.get("SMTP_USER", { infer: true }) || undefined;
    const pass = config.get("SMTP_PASS", { infer: true }) || undefined;
    this.transporter = createTransport({
      // `||`, not `??`: a blank SMTP_HOST in .env reaches ConfigService as "".
      // 127.0.0.1, not "localhost": Node may resolve that to ::1, where the
      // local Mailpit container (bound to 127.0.0.1) is not listening.
      host: config.get("SMTP_HOST", { infer: true }) || "127.0.0.1",
      port: config.get("SMTP_PORT", { infer: true }),
      secure: config.get("SMTP_SECURE", { infer: true }),
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
  }

  async send(mail: OutgoingMail): Promise<void> {
    if (this.isTest) this.outbox.push(mail);
    await this.transporter.sendMail({ from: this.from, ...mail });
    this.logger.log(`Sent "${mail.subject}" to ${redact(mail.to)}`);
  }

  /**
   * The only account email with a link: opening it lets the holder set the
   * account password (see PasswordLinks). There is deliberately no "verify
   * your email" message — verifying would vouch for a password chosen by
   * whoever signed up, who need not own this inbox.
   */
  async sendPasswordLink(to: string, url: string, kind: "setup" | "reset"): Promise<void> {
    const reset = kind === "reset";
    const title = reset ? "Reset your TENDYY password" : "Finish creating your TENDYY account";
    const body = reset
      ? "Someone asked to set a new password for this TENDYY account. Choose a new password to sign in; this signs out every other session."
      : "Choose a password to finish creating your TENDYY account with this email address.";
    const footer = "The link works once and expires in 24 hours. If you did not ask for this, ignore this email; nothing changes until the link is used.";
    await this.send({
      to,
      subject: title,
      text: [body, "", url, "", footer].join("\n"),
      html: layout(title, escapeHtml(body), url, reset ? "Set a new password" : "Set your password", escapeHtml(footer)),
    });
  }

  async sendInvitation(input: {
    to: string;
    organizationName: string;
    inviterName: string | null;
    role: string;
    url: string;
    expiresAt: Date;
  }): Promise<void> {
    const who = input.inviterName ? `${input.inviterName} invited you` : "You have been invited";
    const role = input.role.replace(/_/g, " ").toLowerCase();
    await this.send({
      to: input.to,
      subject: `Join ${input.organizationName} on TENDYY`,
      text: [
        `${who} to join ${input.organizationName} on TENDYY as ${role}.`,
        "",
        input.url,
        "",
        `This invitation expires on ${input.expiresAt.toUTCString()}.`,
        "Sign up or sign in with this email address to accept it.",
      ].join("\n"),
      html: layout(
        `Join ${escapeHtml(input.organizationName)}`,
        `${escapeHtml(who)} to join <strong>${escapeHtml(input.organizationName)}</strong> on TENDYY as ${escapeHtml(role)}.`,
        input.url,
        "Accept invitation",
        `This invitation expires on ${escapeHtml(input.expiresAt.toUTCString())}. Sign up or sign in with this email address to accept it.`,
      ),
    });
  }

  /** Readiness probe: can we reach the SMTP server at all. */
  async verifyTransport(): Promise<boolean> {
    if (this.isTest) return true;
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      this.logger.warn(`SMTP transport not reachable: ${(error as Error).message}`);
      return false;
    }
  }
}

function layout(title: string, body: string, url: string, cta: string, footer: string): string {
  const href = escapeHtml(url);
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px"><tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font-size:20px">${title}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">${body}</p>
<p style="margin:0 0 20px"><a href="${href}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">${cta}</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#475569">Or paste this link into your browser:<br><span style="word-break:break-all">${href}</span></p>
<p style="margin:16px 0 0;font-size:13px;color:#64748b">${footer}</p>
</td></tr></table></td></tr></table></body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function redact(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}
