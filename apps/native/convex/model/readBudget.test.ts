import { describe, expect, it } from "vitest";
import { approximateDocBytes, takeWithinBytes } from "./readBudget";

async function* rowsOf<Row>(rows: Row[], seen: { count: number }) {
  for (const row of rows) {
    seen.count += 1;
    yield row;
  }
}

describe("takeWithinBytes", () => {
  it("stops at the row cap", async () => {
    const seen = { count: 0 };
    const rows = Array.from({ length: 10 }, (_, i) => ({ i }));
    const taken = await takeWithinBytes(rowsOf(rows, seen), {
      maxRows: 3,
      maxBytes: 1_000_000,
    });
    expect(taken).toEqual([{ i: 0 }, { i: 1 }, { i: 2 }]);
    expect(seen.count).toBe(3);
  });

  it("stops once the rows read reach the byte budget", async () => {
    const seen = { count: 0 };
    const big = { content: "x".repeat(1000) };
    const rows = Array.from({ length: 10 }, () => big);
    const taken = await takeWithinBytes(rowsOf(rows, seen), {
      maxRows: 10,
      maxBytes: approximateDocBytes(big) * 2.5,
    });
    expect(taken).toHaveLength(3);
    expect(seen.count).toBe(3);
  });

  it("counts multi-byte text by its encoded size", () => {
    expect(approximateDocBytes({ t: "照明" })).toBe(
      approximateDocBytes({ t: "ab" }) + 4,
    );
  });
});
