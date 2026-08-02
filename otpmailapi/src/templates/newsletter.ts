import { baseHtml, esc } from './base';

export interface NewsletterEmailData {
  clientName: string;
  clientTagline?: string;
  subject: string;
  preheader?: string;
  heading: string;
  bodyHtml: string;
  bodyText: string;
  unsubscribeUrl?: string;
}

export function newsletterEmailHtml(data: NewsletterEmailData): string {
  const unsub = data.unsubscribeUrl
    ? `<p style="font-size:11px;color:#9ca3af;margin-top:24px;text-align:center">
        <a href="${esc(data.unsubscribeUrl)}" style="color:#9ca3af">Unsubscribe</a>
      </p>`
    : '';

  const body = `
    <h2>${esc(data.heading)}</h2>
    ${data.bodyHtml}
    ${unsub}
  `;

  return baseHtml({
    clientName: data.clientName,
    clientTagline: data.clientTagline,
    body,
  });
}

export function newsletterEmailText(data: NewsletterEmailData): string {
  const lines = [data.heading, '', data.bodyText, ''];
  if (data.unsubscribeUrl) lines.push(`Unsubscribe: ${data.unsubscribeUrl}`, '');
  lines.push(`— ${data.clientName}`);
  return lines.join('\n');
}