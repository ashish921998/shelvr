import Header from "@/components/Header";
import ClosingPanel from "@/components/home/ClosingPanel";
import Faq from "@/components/home/Faq";
import Footer from "@/components/home/Footer";
import Hero from "@/components/home/Hero";
import PhotoTidy from "@/components/home/PhotoTidy";
import Search from "@/components/home/Search";
import Spaces from "@/components/home/Spaces";

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-clip bg-paper">
      <Header />
      <Hero />
      <Spaces />
      <Search />
      <PhotoTidy />
      <Faq />
      <ClosingPanel />
      <Footer />
    </main>
  );
}
