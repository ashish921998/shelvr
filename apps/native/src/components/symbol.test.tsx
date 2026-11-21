import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import LibraryBig from "lucide-react-native/icons/library-big";
import { I18nManager } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import { AppSymbolIcon } from "./symbol";

vi.mock("react-native", () => ({ I18nManager: { isRTL: false } }));
vi.mock("react-native-svg", () => ({}));

afterEach(() => {
  I18nManager.isRTL = false;
});

it("renders the Lucide glyph with the caller's size and tint", () => {
  const glyph = AppSymbolIcon({
    name: "books.vertical.fill",
    size: 28,
    tintColor: "#8a5000",
    weight: "semibold",
  });

  expect(glyph.type).toBe(LibraryBig);
  expect(glyph.props).toMatchObject({
    accessible: false,
    pointerEvents: "none",
    size: 28,
    color: "#8a5000",
    strokeWidth: 2.25,
  });
});

it("mirrors navigation chevrons in right-to-left layouts", () => {
  expect(AppSymbolIcon({ name: "chevron.left" }).type).toBe(ChevronLeft);
  expect(AppSymbolIcon({ name: "chevron.right" }).type).toBe(ChevronRight);

  I18nManager.isRTL = true;

  expect(AppSymbolIcon({ name: "chevron.left" }).type).toBe(ChevronRight);
  expect(AppSymbolIcon({ name: "chevron.right" }).type).toBe(ChevronLeft);
});
