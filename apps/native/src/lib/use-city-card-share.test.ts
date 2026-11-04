import { describe, expect, it, vi } from "vitest";

import { cardFileName } from "@/lib/use-city-card-share";

vi.mock("@shopify/react-native-skia", () => ({ makeImageFromView: vi.fn() }));
vi.mock("expo-file-system", () => ({ File: class {}, Paths: {} }));
vi.mock("expo-sharing", () => ({}));
vi.mock("@/lib/analytics", () => ({ analytics: {} }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));

describe("cardFileName", () => {
  it("names the image after the city, safely", () => {
    expect(cardFileName("São Paulo")).toBe("shelvr-sao-paulo.png");
    expect(cardFileName("New York City")).toBe("shelvr-new-york-city.png");
    expect(cardFileName("東京")).toBe("shelvr-city.png");
  });
});
