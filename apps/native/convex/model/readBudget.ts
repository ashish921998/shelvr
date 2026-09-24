/** Rough UTF-8 size of a document, for keeping a query's reads under Convex's
 * per-function read limit. Counts the JSON form, which tracks the stored
 * size closely enough for a budget with headroom. */
export function approximateDocBytes(doc: unknown): number {
  return new TextEncoder().encode(JSON.stringify(doc)).length;
}

/** Reads rows from `rows` until `maxRows` are taken or the rows taken so far
 * reach `maxBytes`. The document that crosses the budget is kept, since it
 * has already been read; the budget bounds everything after it. */
export async function takeWithinBytes<Row>(
  rows: AsyncIterable<Row>,
  { maxRows, maxBytes }: { maxRows: number; maxBytes: number },
): Promise<Row[]> {
  const taken: Row[] = [];
  let bytes = 0;
  if (maxRows <= 0) return taken;
  for await (const row of rows) {
    taken.push(row);
    bytes += approximateDocBytes(row);
    if (taken.length >= maxRows || bytes >= maxBytes) break;
  }
  return taken;
}
