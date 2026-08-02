import { baseHtml, esc } from './base';

export interface OtpEmailData {
  clientName: string;
  clientTagline?: string;
  code: string;
  ttlMinutes: number;
  purpose: string;
  recipientName?: string;
}

export function otpEmailHtml(data: OtpEmailData): string {
  const greeting = data.recipientName
    ? `Hi ${esc(data.recipientName)},`
    : 'Hi,';

  const purposeLabel = data.purpose === 'login' ? 'sign in' : data.purpose;

  const body = `
    <h2>${esc(greeting)}</h2>
    <p>Use the code below to ${esc(purposeLabel)}. It expires in ${data.ttlMinutes} minute${data.ttlMinutes === 1 ? '' : 's'}.</p>
    <div class="code-box">
      <div class="code">${esc(data.code)}</div>
      <div class="label">Verification Code</div>
    </div>
    <p style="font-size:13px;color:#6b7280">
      If you did not request this code, you can safely ignore this email.
      Do not share this code with anyone.
    </p>
  `;

  return baseHtml({
    clientName: data.clientName,
    clientTagline: data.clientTagline,
    body,
  });
}

export function otpEmailText(data: OtpEmailData): string {
  const greeting = data.recipientName
    ? `Hi ${data.recipientName},`
    : 'Hi,';

  const purposeLabel = data.purpose === 'login' ? 'sign in' : data.purpose;

  return [
    greeting,
    '',
    `Your verification code to ${purposeLabel}: ${data.code}`,
    '',
    `This code expires in ${data.ttlMinutes} minute${data.ttlMinutes === 1 ? '' : 's'}.`,
    '',
    'If you did not request this code, please ignore this email.',
    '',
    `— ${data.clientName}`,
  ].join('\n');
}