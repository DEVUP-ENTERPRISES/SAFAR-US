import { config } from '../../../config';

/**
 * The transactional email template.
 *
 * Email is not the web. Four constraints shape everything here, and every one
 * of them is a real client bug rather than a stylistic preference:
 *
 *  - TABLES, NOT FLEX. Outlook renders through Word's engine, which does not
 *    support flexbox, grid, or most of modern CSS. A div layout that looks
 *    right everywhere else collapses into a single column there.
 *  - INLINE STYLES. Gmail strips <style> blocks in many contexts, so anything
 *    that matters has to sit on the element.
 *  - A PREHEADER. The inbox preview otherwise shows whatever text comes first,
 *    which is usually the brand name repeated. This is the line that decides
 *    whether the mail is opened at all.
 *  - AN IDENTIFIED SENDER. CAN-SPAM requires a real postal address, and mail
 *    without one is more likely to be filtered as spam even when transactional.
 */

const BRAND = '#0e918c'; // Meridian teal — matches the app, not the old emerald
const INK = '#141210';
const MUTED = '#6b6560';
const PAPER = '#f8f6f2';
const BORDER = '#e6e1d9';

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface EmailContent {
  title: string;
  body: string;
  /** Absolute URL for the primary action. */
  actionUrl?: string;
  actionLabel?: string;
  /** Inbox preview line. Falls back to the body. */
  preheader?: string;
  /** Extra lines under the body — an itemised charge, a set of dates. */
  facts?: { label: string; value: string }[];
}

export function renderEmail(c: EmailContent): string {
  const brand = config.notifications.brandName || 'SAFAR';
  // Emails need an ABSOLUTE url — they can't reach local files. Served from the
  // web app's /public. Falls back to text-only when no web URL is configured,
  // and the alt text covers the (common) case of a client blocking images.
  const logoUrl = config.notifications.webUrl ? `${config.notifications.webUrl}/logos/cato-logo-256.png` : '';
  const web = config.notifications.webUrl || '';
  const support = config.notifications.supportEmail;
  const address = config.notifications.companyAddress;
  const preheader = c.preheader ?? c.body.slice(0, 140);

  const facts = (c.facts ?? [])
    .map(
      (f) => `
        <tr>
          <td style="padding:6px 0;color:${MUTED};font-size:14px">${esc(f.label)}</td>
          <td style="padding:6px 0;color:${INK};font-size:14px;font-weight:600;text-align:right">${esc(f.value)}</td>
        </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<!-- Tells clients the mail is designed for both schemes, so they stop
     auto-inverting it into something unreadable. -->
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(c.title)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
  <!-- Preheader: shown in the inbox list, hidden in the message itself. The
       trailing entities stop clients padding the preview with body text. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
    ${esc(preheader)}
    &#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:560px;background:#ffffff;border:1px solid ${BORDER};border-radius:16px;">

          <!-- Header -->
          <tr>
            <td style="padding:24px 28px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                ${logoUrl ? `<td style="padding-right:10px;vertical-align:middle;">
                  <img src="${logoUrl}" width="34" height="34" alt="${esc(brand)}"
                       style="display:block;border:0;outline:none;text-decoration:none;height:34px;width:34px;" />
                </td>` : ''}
                <td style="vertical-align:middle;">
                  <span style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                               font-size:16px;font-weight:800;letter-spacing:-0.01em;color:${BRAND};">
                    ${esc(brand)}
                  </span>
                </td>
              </tr></table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:16px 28px 4px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;font-weight:700;color:${INK};">
                ${esc(c.title)}
              </h1>
              <p style="margin:0;font-size:15px;line-height:1.6;color:${MUTED};">
                ${esc(c.body)}
              </p>
            </td>
          </tr>

          ${
            facts
              ? `<tr>
            <td style="padding:16px 28px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                            border-top:1px solid ${BORDER};padding-top:8px;">
                ${facts}
              </table>
            </td>
          </tr>`
              : ''
          }

          ${
            c.actionUrl
              ? `<tr>
            <td style="padding:24px 28px 4px;">
              <!-- Bulletproof button: Outlook ignores border-radius on <a>, so
                   the padded table cell does the work instead. -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="${BRAND}" style="border-radius:10px;">
                    <a href="${esc(c.actionUrl)}"
                       style="display:inline-block;padding:12px 24px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                              font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
                      ${esc(c.actionLabel ?? 'View details')}
                    </a>
                  </td>
                </tr>
              </table>
              <!-- The raw link, because a proxy or a text-only client will not
                   render the button and the recipient still needs to get there. -->
              <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:${MUTED};
                        font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;word-break:break-all;">
                Or paste this into your browser:<br>${esc(c.actionUrl)}
              </p>
            </td>
          </tr>`
              : ''
          }

          <!-- Footer -->
          <tr>
            <td style="padding:24px 28px 26px;">
              <div style="border-top:1px solid ${BORDER};padding-top:16px;
                          font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                          font-size:12px;line-height:1.6;color:${MUTED};">
                <p style="margin:0 0 6px;">
                  You are receiving this because of activity on your ${esc(brand)} account.
                </p>
                ${
                  web
                    ? `<p style="margin:0 0 6px;">
                        <a href="${esc(web)}/account/notifications" style="color:${BRAND};text-decoration:underline;">
                          Choose which emails you get
                        </a>
                      </p>`
                    : ''
                }
                <p style="margin:0 0 6px;">
                  Questions? <a href="mailto:${esc(support)}" style="color:${BRAND};text-decoration:underline;">${esc(support)}</a>
                </p>
                ${address ? `<p style="margin:0;color:#9a938c;">${esc(address)}</p>` : ''}
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Plain-text alternative. Never ship HTML alone — it hurts deliverability. */
export function renderText(c: EmailContent): string {
  const lines = [c.title, '', c.body];
  if (c.facts?.length) {
    lines.push('');
    for (const f of c.facts) lines.push(`${f.label}: ${f.value}`);
  }
  if (c.actionUrl) lines.push('', `${c.actionLabel ?? 'View details'}: ${c.actionUrl}`);
  const support = config.notifications.supportEmail;
  lines.push('', '—', `Questions? ${support}`);
  if (config.notifications.companyAddress) lines.push(config.notifications.companyAddress);
  return lines.join('\n');
}
