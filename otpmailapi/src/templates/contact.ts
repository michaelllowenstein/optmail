import { baseHtml, esc } from './base';

export interface ContactEmailData {
  clientName: string;
  clientTagline?: string;
  senderName: string;
  senderEmail: string;
  senderPhone?: string;
  subject?: string;
  message: string;
}

export function contactEmailHtml(data: ContactEmailData): string {
  const body = `
    <div class="badge">New Message</div>
    <h2>Contact Form Submission</h2>
    <table class="fields">
      <tr><td class="label">Name</td><td>${esc(data.senderName)}</td></tr>
      <tr><td class="label">Email</td><td><a href="mailto:${esc(data.senderEmail)}">${esc(data.senderEmail)}</a></td></tr>
      ${data.senderPhone ? `<tr><td class="label">Phone</td><td>${esc(data.senderPhone)}</td></tr>` : ''}
      ${data.subject ? `<tr><td class="label">Subject</td><td>${esc(data.subject)}</td></tr>` : ''}
    </table>
    <p style="font-size:12px;color:#9ca3af;margin:0 0 6px">Message:</p>
    <div class="msg">${esc(data.message).replace(/\n/g, '<br>')}</div>
  `;

  return baseHtml({
    clientName: data.clientName,
    clientTagline: data.clientTagline,
    body,
  });
}

export function contactEmailText(data: ContactEmailData): string {
  return [
    `Contact Form Submission`,
    '',
    `Name:    ${data.senderName}`,
    `Email:   ${data.senderEmail}`,
    ...(data.senderPhone ? [`Phone:   ${data.senderPhone}`] : []),
    ...(data.subject ? [`Subject: ${data.subject}`] : []),
    '',
    `Message:`,
    data.message,
    '',
    `— via ${data.clientName}`,
  ].join('\n');
}

// ── Auto-reply to the sender ────────────────────────────────────────────────

export function contactAutoReplyHtml(data: { clientName: string; clientTagline?: string; senderName: string }): string {
  const firstName = data.senderName.split(' ')[0];

  const body = `
    <h2>Thank you, ${esc(firstName)}.</h2>
    <p>We have received your message and will get back to you as soon as possible.</p>
    <p style="font-size:13px;color:#9ca3af;margin-top:24px">
      This is an automated confirmation. Please do not reply to this email.
    </p>
  `;

  return baseHtml({
    clientName: data.clientName,
    clientTagline: data.clientTagline,
    body,
  });
}

export function contactAutoReplyText(data: { clientName: string; senderName: string }): string {
  const firstName = data.senderName.split(' ')[0];
  return [
    `Thank you, ${firstName}.`,
    '',
    `We have received your message and will get back to you as soon as possible.`,
    '',
    `— ${data.clientName}`,
  ].join('\n');
}