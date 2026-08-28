import Header from "@/components/Header";
import Features from "@/components/home/Features";
import Footer from "@/components/home/Footer";
import FooterHero from "@/components/home/FooterHero";
import Hero from "@/components/home/Hero";
import HowItWorks from "@/components/home/HowItWorks";
import Spaces from "@/components/home/Spaces";
import Stats from "@/components/home/Stats";

export default function Home() {
  return (
    <main className="min-h-screen bg-paper">
      <Header />
      <Hero />
      <Stats />
      <HowItWorks />
      <Spaces />
      <Features />
      <FooterHero />
      <Footer />
    </main>
  );
}
