import type { Metadata } from "next";
import Header from "@/components/Header";
import ClosingPanel from "@/components/home/ClosingPanel";
import Faq from "@/components/home/Faq";
import Footer from "@/components/home/Footer";
import Hero from "@/components/home/Hero";
import PhotoTidy from "@/components/home/PhotoTidy";
import Search from "@/components/home/Search";
import Spaces from "@/components/home/Spaces";

const title = "Shelvr — save the mess, find it on a shelf";
const description =
  "Links, photos and notes, saved in a tap and filed into the right Space. No folders.";

// The canonical URL belongs to this page, not the root layout: a page that
// sets no `alternates` or `openGraph` inherits the layout's, so the legal and
// support pages used to declare the home page as their canonical.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description,
    url: "/",
    siteName: "Shelvr",
    type: "website",
  },
};

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
