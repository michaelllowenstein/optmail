import { baseHtml, esc } from './base';

export interface ConfirmationEmailData {
  clientName: string;
  clientTagline?: string;
  recipientName?: string;
  subject: string;
  heading: string;
  bodyText: string;
  ctaUrl?: string;
  ctaLabel?: string;
}

export function confirmationEmailHtml(data: ConfirmationEmailData): string {
  const greeting = data.recipientName
    ? `Hi ${esc(data.recipientName)},`
    : '';

  const cta = data.ctaUrl
    ? `<p style="margin:24px 0">
        <a href="${esc(data.ctaUrl)}" style="display:inline-block;background:#6366f1;color:#fff;
          padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;
          text-decoration:none;letter-spacing:.02em">
          ${esc(data.ctaLabel ?? 'Continue')}
        </a>
      </p>`
    : '';

  const body = `
    <h2>${esc(data.heading)}</h2>
    ${greeting ? `<p>${greeting}</p>` : ''}
    <p>${esc(data.bodyText)}</p>
    ${cta}
  `;

  return baseHtml({
    clientName: data.clientName,
    clientTagline: data.clientTagline,
    body,
  });
}

export function confirmationEmailText(data: ConfirmationEmailData): string {
  const lines = [data.heading, ''];
  if (data.recipientName) lines.push(`Hi ${data.recipientName},`, '');
  lines.push(data.bodyText, '');
  if (data.ctaUrl) lines.push(`${data.ctaLabel ?? 'Continue'}: ${data.ctaUrl}`, '');
  lines.push(`— ${data.clientName}`);
  return lines.join('\n');
}