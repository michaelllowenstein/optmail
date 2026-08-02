/**
 * templates/base.ts
 *
 * Base HTML email shell used by all email types.
 * Mirrors the fl-legal mailer pattern — professional, branded wrapper
 * with client name injected dynamically.
 */

export interface BaseTemplateData {
  clientName: string;
  clientTagline?: string;
  body: string;
}

export function baseHtml(data: BaseTemplateData): string {
  const year = new Date().getFullYear();
  const tagline = data.clientTagline ?? '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body  { margin:0; padding:0; background:#f5f5f5; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#1a1a1a; }
    .wrap { max-width:600px; margin:32px auto; background:#fff; border-radius:12px;
            overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,.08); }
    .hdr  { background:#1a1a2e; padding:28px 32px; }
    .hdr h1 { margin:0; color:#e8e8e8; font-size:18px; font-weight:600; letter-spacing:.02em; }
    .hdr p  { margin:4px 0 0; color:rgba(255,255,255,.4); font-size:11px;
              text-transform:uppercase; letter-spacing:.1em; }
    .body { padding:32px; }
    .body h2 { margin:0 0 16px; font-size:20px; color:#1a1a2e; font-weight:600; }
    .body p  { font-size:15px; line-height:1.7; color:#374151; margin:0 0 12px; }
    .code-box { background:#f0f4ff; border:2px dashed #6366f1; border-radius:12px;
                text-align:center; padding:24px; margin:24px 0; }
    .code-box .code { font-size:36px; font-weight:700; letter-spacing:.3em; color:#1a1a2e;
                      font-family:'Courier New',monospace; }
    .code-box .label { font-size:11px; text-transform:uppercase; letter-spacing:.1em;
                       color:#6b7280; margin-top:8px; }
    .msg  { background:#f9fafb; border-left:4px solid #6366f1; padding:16px;
            border-radius:0 8px 8px 0; font-size:14px; line-height:1.7; margin:16px 0; }
    table.fields { width:100%; border-collapse:collapse; margin:16px 0; }
    table.fields td { padding:8px 12px; font-size:14px; vertical-align:top; }
    table.fields tr:nth-child(odd) td { background:#f9fafb; border-radius:4px; }
    table.fields td.label { width:110px; font-size:11px; text-transform:uppercase;
                            letter-spacing:.08em; color:#9ca3af; font-weight:600; padding-top:10px; }
    .ftr  { background:#111827; padding:18px 32px; text-align:center;
            font-size:11px; color:rgba(255,255,255,.3); }
    .badge { display:inline-block; background:#6366f1; color:#fff; font-size:11px;
             font-weight:700; text-transform:uppercase; letter-spacing:.1em;
             padding:4px 12px; border-radius:999px; margin-bottom:12px; }
    a { color:#6366f1; text-decoration:none; }
    a:hover { text-decoration:underline; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr">
      <h1>${esc(data.clientName)}</h1>
      ${tagline ? `<p>${esc(tagline)}</p>` : ''}
    </div>
    <div class="body">${data.body}</div>
    <div class="ftr">&copy; ${year} ${esc(data.clientName)}. All rights reserved.</div>
  </div>
</body>
</html>`;
}

// ── HTML escaping (same pattern as fl-legal) ────────────────────────────────

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}