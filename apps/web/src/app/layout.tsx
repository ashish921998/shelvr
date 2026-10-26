import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import { APP_STORE_ID } from "@/lib/appStore";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/siteMetadata";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://shelvr-web.vercel.app"),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  itunes: { appId: APP_STORE_ID },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: "Shelvr",
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
    <html lang="en">
      <body>
        <PageShell>{children}</PageShell>
      </body>
    </html>
  );
}
