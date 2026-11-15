import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { CTA_VARIANT_SCRIPT } from "@/lib/ctaVariant";

import RootLayout from "./layout";

describe("RootLayout", () => {
  it("assigns the button variant from the head, before the body paints", () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <main />
      </RootLayout>,
    );

    const head = /<head>(.*)<\/head>/s.exec(html)?.[1] ?? "";
    const scripts = [...head.matchAll(/<script>(.*?)<\/script>/gs)].map(
      (match) => match[1],
    );
    expect(scripts).toContain(CTA_VARIANT_SCRIPT);
  });
});
