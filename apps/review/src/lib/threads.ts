export type CommentRow = {
  _id: string;
  _creationTime: number;
  parentId: string | null;
  timestamp: number | null;
  resolved: boolean;
};

export type Thread<T extends CommentRow> = { root: T; replies: T[] };

export function buildThreads<T extends CommentRow>(
  rows: T[],
  { showResolved }: { showResolved: boolean },
): Thread<T>[] {
  const replies = new Map<string, T[]>();
  const roots: T[] = [];
  for (const row of rows) {
    if (row.parentId === null) {
      roots.push(row);
    } else {
      const list = replies.get(row.parentId) ?? [];
      list.push(row);
      replies.set(row.parentId, list);
    }
  }
  return roots
    .filter((root) => showResolved || !root.resolved)
    .sort((a, b) => {
      const at = a.timestamp ?? Number.POSITIVE_INFINITY;
      const bt = b.timestamp ?? Number.POSITIVE_INFINITY;
      if (at !== bt) return at - bt;
      return a._creationTime - b._creationTime;
    })
    .map((root) => ({
      root,
      replies: (replies.get(root._id) ?? []).sort(
        (a, b) => a._creationTime - b._creationTime,
      ),
    }));
}

export function countOpen(rows: CommentRow[]): number {
  return rows.filter((row) => row.parentId === null && !row.resolved).length;
}
