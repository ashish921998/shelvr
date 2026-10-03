"use client";

import { useEffect, useState } from "react";
import Logo from "./common/Logo";
import StoreButton from "./home/StoreButton";

const navigation = [
  { name: "Spaces", href: "#shelves" },
  { name: "Search", href: "#find" },
  { name: "Photo tidy", href: "#tidy" },
  { name: "FAQ", href: "#faq" },
];

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
        <div className="flex items-center gap-2">
          <ul className="hidden items-center min-[760px]:flex">
            {navigation.map((item) => (
              <li key={item.name}>
                <a
                  href={item.href}
                  className="flex h-10 items-center px-3.5 text-sm font-medium text-muted transition-colors hover:text-ember-deep"
                >
                  {item.name}
                </a>
              </li>
            ))}
          </ul>
          <StoreButton source="header" />
        </div>
      </nav>
    </header>
  );
}
