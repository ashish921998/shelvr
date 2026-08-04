import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter-loaded",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Shelvr — save it for later",
  description:
    "Capture links, images, and notes. Shelvr classifies them into spaces so you can find them later.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={cn(inter.className, fraunces.variable, inter.variable)}>
        {children}
      </body>
    </html>
  );
}
