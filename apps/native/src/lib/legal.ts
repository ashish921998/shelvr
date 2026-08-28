/**
 * Hosted legal surfaces. Terms and Privacy live on the marketing site.
 */
export const LEGAL_URLS = {
  terms: 'https://shelvr-web.vercel.app/terms',
  privacy: 'https://shelvr-web.vercel.app/privacy',
} as const;

export const SUPPORT_URL = 'mailto:support@shelvr.app?subject=Shelvr%20Support';

export type LegalLinkKind = keyof typeof LEGAL_URLS;
