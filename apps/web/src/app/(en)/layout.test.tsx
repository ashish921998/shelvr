import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import EnglishLayout from "@/app/(en)/layout";
import GermanLayout from "@/app/de/layout";
import FrenchLayout from "@/app/fr/layout";
import { CTA_VARIANT_SCRIPT } from "@/lib/ctaVariant";

it.each([
  ["en", EnglishLayout],
  ["de", GermanLayout],
  ["fr", FrenchLayout],
] as const)(
  "renders a %s document with the CTA variant script in its head",
  (lang, layout) => {
    const html = renderToStaticMarkup(createElement(layout, null, <main />));

    expect(html).toMatch(new RegExp(`^<html lang="${lang}"`));
    const head = /<head>(.*)<\/head>/s.exec(html)?.[1] ?? "";
    expect(head).toContain(`<script>${CTA_VARIANT_SCRIPT}</script>`);
  },
);
