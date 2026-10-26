export function approximateDocBytes(doc: unknown): number {
  return new TextEncoder().encode(JSON.stringify(doc)).length;
}

export async function takeWithinBytes<Row>(
  rows: AsyncIterable<Row>,
  { maxRows, maxBytes }: { maxRows: number; maxBytes: number },
): Promise<{ rows: Row[]; bytes: number }> {
  const taken: Row[] = [];
  let bytes = 0;
  if (maxRows <= 0 || maxBytes <= 0) return { rows: taken, bytes };
  for await (const row of rows) {
    taken.push(row);
    bytes += approximateDocBytes(row);
    if (taken.length >= maxRows || bytes >= maxBytes) break;
  }
  return { rows: taken, bytes };
}
