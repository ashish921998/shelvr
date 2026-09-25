"use client";

import type { ReactNode } from "react";
import { useAppStoreLink } from "@/lib/appStoreLink";

export default function FooterAppStoreLink({
  children,
}: {
  children: ReactNode;
}) {
  const { href, onClick } = useAppStoreLink("footer-nav");
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className="text-sm font-medium text-muted transition-colors hover:text-ink"
    >
      {children}
    </a>
  );
}
