import type { Metadata } from "next";

import Header from "@/components/Header";
import ClosingPanel from "@/components/home/ClosingPanel";
import Footer from "@/components/home/Footer";
import Hero from "@/components/home/Hero";
import Plans from "@/components/home/Plans";
import Story from "@/components/home/Story";
import { pageMetadata, SITE_DESCRIPTION, SITE_TITLE } from "@/lib/siteMetadata";

export const metadata: Metadata = pageMetadata(
  "/",
  SITE_TITLE,
  SITE_DESCRIPTION,
);

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-clip bg-paper">
      <Header />
      <main>
        <Hero />
        <Story />
        <Plans />
        <ClosingPanel />
      </main>
      <Footer />
    </div>
  );
}
