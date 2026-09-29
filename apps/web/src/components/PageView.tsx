"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { capturePageview } from "@/lib/pageview";

export default function PageView() {
  const pathname = usePathname();
  useEffect(() => {
    capturePageview();
  }, [pathname]);
  return null;
}
