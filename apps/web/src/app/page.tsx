import type { Metadata } from "next";

import Header from "@/components/Header";
import ClosingPanel from "@/components/home/ClosingPanel";
import Faq from "@/components/home/Faq";
import Footer from "@/components/home/Footer";
import Hero from "@/components/home/Hero";
import PhotoTidy from "@/components/home/PhotoTidy";
import Search from "@/components/home/Search";
import Spaces from "@/components/home/Spaces";
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
        <Spaces />
        <Search />
        <PhotoTidy />
        <Faq />
        <ClosingPanel />
      </main>
      <Footer />
    </div>
  );
}
