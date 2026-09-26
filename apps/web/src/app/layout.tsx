import type { Metadata } from "next";
import { APP_STORE_ID } from "@/lib/appStore";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://shelvr-web.vercel.app"),
  title: "Shelvr — save the mess, find it on a shelf",
  description:
    "Links, photos and notes, saved in a tap and filed into the right Space. No folders.",
  itunes: { appId: APP_STORE_ID },
  alternates: { canonical: "/" },
  openGraph: {
    title: "Shelvr — save the mess, find it on a shelf",
    description:
      "Links, photos and notes, saved in a tap and filed into the right Space. No folders.",
    url: "/",
    siteName: "Shelvr",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Shelvr — save the mess, find it on a shelf",
    description:
      "Links, photos and notes, saved in a tap and filed into the right Space. No folders.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
