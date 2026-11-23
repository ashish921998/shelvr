import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import { APP_STORE_ID } from "@/lib/appStore";
import { CTA_VARIANT_SCRIPT } from "@/lib/ctaVariant";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_ORIGIN,
  SITE_TITLE,
} from "@/lib/siteMetadata";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  itunes: { appId: APP_STORE_ID },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: CTA_VARIANT_SCRIPT }} />
      </head>
      <body>
        <PageShell>{children}</PageShell>
      </body>
    </html>
  );
}
