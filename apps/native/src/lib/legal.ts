/**
 * Hosted legal and support surfaces. Terms and Privacy live on the marketing
 * site; support is a mailto so the user can report account, privacy, content,
 * or subscription problems without a Pro purchase.
 */
export const LEGAL_URLS = {
  terms: 'https://shelvr.app/terms',
  privacy: 'https://shelvr.app/privacy',
  supportEmail: 'support@shelvr.app',
  supportMailto: 'mailto:support@shelvr.app',
} as const;

export type LegalLinkKind = keyof typeof LEGAL_URLS;
