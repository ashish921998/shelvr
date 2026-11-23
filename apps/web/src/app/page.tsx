import type { Metadata } from "next";

import Header from "@/components/Header";
import ClosingPanel from "@/components/home/ClosingPanel";
import Footer from "@/components/home/Footer";
import Hero from "@/components/home/Hero";
import Plans from "@/components/home/Plans";
import ProblemProof from "@/components/home/ProblemProof";
import Story from "@/components/home/Story";
import {
  pageMetadata,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_ORIGIN,
} from "@/lib/siteMetadata";
import { LANGUAGE_ALTERNATES } from "@/lib/localizedLanding";

const TITLE = "Save Places from Reels and TikTok | Shelvr";
const HOME_URL = `${SITE_ORIGIN}/`;
const ORGANIZATION_ID = `${HOME_URL}#organization`;

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${HOME_URL}#website`,
      name: SITE_NAME,
      url: HOME_URL,
      publisher: { "@id": ORGANIZATION_ID },
    },
    {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: SITE_NAME,
      url: HOME_URL,
      logo: `${SITE_ORIGIN}/shelvr-mark.svg`,
    },
  ],
};

export const metadata: Metadata = {
  ...pageMetadata("/", TITLE, SITE_DESCRIPTION),
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: SITE_DESCRIPTION,
  },
  alternates: { canonical: "/", languages: LANGUAGE_ALTERNATES },
};

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-clip bg-paper">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
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
