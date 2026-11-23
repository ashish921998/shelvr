import type { Metadata } from "next";

import Header from "@/components/Header";
import ClosingPanel from "@/components/home/ClosingPanel";
import Footer from "@/components/home/Footer";
import Hero from "@/components/home/Hero";
import Plans from "@/components/home/Plans";
import ProblemProof from "@/components/home/ProblemProof";
import Story from "@/components/home/Story";
import { pageMetadata, SITE_DESCRIPTION } from "@/lib/siteMetadata";

const TITLE = "Save Places from Reels and TikTok | Shelvr";

export const metadata: Metadata = {
  ...pageMetadata("/", TITLE, SITE_DESCRIPTION),
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-clip bg-paper">
      <Header />
      <main>
        <Hero />
        <ProblemProof />
        <Story />
        <Plans />
        <ClosingPanel />
      </main>
      <Footer />
    </div>
  );
}
