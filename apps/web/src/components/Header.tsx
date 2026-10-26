"use client";

import { useEffect, useState } from "react";
import Logo from "./common/Logo";
import StoreButton from "./home/StoreButton";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-30 border-b border-ink/6 bg-paper/82 backdrop-blur-[14px] transition-shadow duration-300 ${
        scrolled ? "shadow-[0_8px_24px_-12px_rgba(43,36,24,.18)]" : ""
      }`}
    >
      <nav className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-3.5">
        <Logo />
        <StoreButton source="header" />
      </nav>
    </header>
  );
}
