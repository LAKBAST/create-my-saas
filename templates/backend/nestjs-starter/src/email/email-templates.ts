// Branded transactional emails: one layout, sent as HTML with a plain-text twin.
// The layout and the texts live in `email/` (synced from templates/shared/email),
// so every backend sends the same emails. Keep this file identical in the
// NestJS and Fastify templates.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Email = { subject: string; text: string; html: string };
export type EmailBrand = { productName: string; frontendUrl: string; accentColor?: string };
export type EmailContent = {
  subject: string;
  title: string;
  paragraphs: string[];
  /** Button label and URL. */
  action?: [string, string];
  /** Label and value for tokens typed by hand. */
  code?: [string, string];
  note?: string;
};
type SharedMessage = { subject: string; title: string; paragraphs: string[]; action?: string; code?: string; note?: string };
type SharedConfig = { lang: string; accent: string; fragments: Record<'paragraph' | 'action' | 'code' | 'note' | 'footer', string>; messages: Record<string, SharedMessage>; months: string[] };

/** Brand settings from PRODUCT_NAME, FRONTEND_URL and EMAIL_ACCENT_COLOR. */
export function emailBrand(environment: Record<string, string | undefined> = process.env): EmailBrand {
  return {
    productName: environment.PRODUCT_NAME?.trim() || 'Starter',
    frontendUrl: environment.FRONTEND_URL || 'http://localhost:3000',
    accentColor: environment.EMAIL_ACCENT_COLOR?.trim() || undefined,
  };
}

const placeholder = /\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g;
let assets: { layout: string; config: SharedConfig } | undefined;

function loadAssets(): { layout: string; config: SharedConfig } {
  // The backend runs from its own folder in development, tests and the Docker image.
  const directory = join(process.cwd(), 'email');
  assets ??= {
    layout: readFileSync(join(directory, 'layout.html'), 'utf8'),
    config: JSON.parse(readFileSync(join(directory, 'email.json'), 'utf8')) as SharedConfig,
  };
  return assets;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

/** {{name}} is HTML-escaped, {{{name}}} is inserted as is; unknown names stay empty. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(placeholder, (_match, raw: string | undefined, escaped: string | undefined) =>
    raw ? values[raw] ?? '' : escapeHtml(values[escaped ?? ''] ?? ''));
}

const plain = (template: string, values: Record<string, string>): string =>
  template.replace(placeholder, (_match, raw: string | undefined, escaped: string | undefined) => values[raw ?? escaped ?? ''] ?? '');

export function renderEmail(brand: EmailBrand, content: EmailContent): Email {
  const { layout, config } = loadAssets();
  const { fragments } = config;
  const home = brand.frontendUrl.replace(/\/$/, '');
  const accent = brand.accentColor || config.accent;
  const product = brand.productName;

  let body = content.paragraphs.map((text) => fill(fragments.paragraph, { text })).join('');
  if (content.action) body += fill(fragments.action, { label: content.action[0], url: content.action[1], accent });
  if (content.code) body += fill(fragments.code, { label: content.code[0], value: content.code[1] });
  if (content.note) body += fill(fragments.note, { text: content.note });
  const html = fill(layout, {
    lang: config.lang, subject: content.subject, preheader: content.paragraphs[0] ?? content.title,
    accent, initial: product.slice(0, 1).toUpperCase() || 'S', product, title: content.title,
    body, footer: fill(fragments.footer, { home, product }),
  });

  const lines = [content.title, '', ...content.paragraphs];
  if (content.action) lines.push('', `${content.action[0]}: ${content.action[1]}`);
  if (content.code) lines.push('', `${content.code[0]}: ${content.code[1]}`);
  if (content.note) lines.push('', content.note);
  lines.push('', '—', `${product} · ${home}`);
  return { subject: content.subject, text: lines.join('\n'), html };
}

/** Renders one of the shared messages in email.json (email_verification, password_reset...). */
export function renderMessage(
  brand: EmailBrand,
  key: string,
  options: { url?: string; code?: string; values?: Record<string, string> } = {},
): Email {
  const message = loadAssets().config.messages[key];
  if (!message) throw new Error(`Unknown email message: ${key}`);
  const values = options.values ?? {};
  return renderEmail(brand, {
    subject: plain(message.subject, values),
    title: plain(message.title, values),
    paragraphs: message.paragraphs.map((paragraph) => plain(paragraph, values)),
    action: options.url && message.action ? [message.action, options.url] : undefined,
    code: options.code && message.code ? [message.code, options.code] : undefined,
    note: message.note ? plain(message.note, values) : undefined,
  });
}

/** A date as the emails write it, for example "13 de noviembre de 2026" (UTC). */
export function formatLongDate(date: Date): string {
  return `${date.getUTCDate()} de ${loadAssets().config.months[date.getUTCMonth()]} de ${date.getUTCFullYear()}`;
}
