import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://shelvr.app"),
  title: "Shelvr — save it for later",
  description:
    "Capture links, images, and notes. Shelvr classifies them into spaces so you can find them later.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Shelvr — save it for later",
    description:
      "Capture links, images, and notes. Shelvr classifies them into spaces so you can find them later.",
    url: "/",
    siteName: "Shelvr",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Shelvr — save it for later",
    description:
      "Capture links, images, and notes. Shelvr classifies them into spaces so you can find them later.",
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
