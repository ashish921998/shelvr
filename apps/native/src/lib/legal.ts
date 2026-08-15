/**
 * Hosted legal surfaces. Terms and Privacy live on the marketing site.
 */
export const LEGAL_URLS = {
  terms: 'https://shelvr.app/terms',
  privacy: 'https://shelvr.app/privacy',
} as const;

export type LegalLinkKind = keyof typeof LEGAL_URLS;
