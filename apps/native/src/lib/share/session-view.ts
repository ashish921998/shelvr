// The pure derivations the share screen renders from. They live next to the
// session store and the processor rather than inside the screen so each one has
// exactly ONE definition — in particular the "what still needs saving" decision,
// which the retry button and the processor must never disagree about — and so
// they stay unit-testable without a React renderer or the native share module.

import {
  resolvedFromRawPayloads,
  shareGroups,
  type ResolvedPayload,
} from "./process-share";
import {
  entriesToProcess,
  type RawSharePayload,
  type ShareEntry,
  type ShareSession,
} from "./storage";

/** True when at least one entry is still worth attempting, i.e. the partial
 * screen should offer "Retry failed". Routed through `entriesToProcess` so the
 * retry the UI offers and the set the processor actually re-attempts cannot
 * drift apart: saved entries are never re-saved and unsupported entries have
 * nothing to retry. */
export function hasRetryableEntries(session: ShareSession): boolean {
  return entriesToProcess(session).length > 0;
}

const isFailed = (e: ShareEntry) =>
  e.status === "failed" || e.status === "unsupported";

/** One outcome per saved item: a group of entries sharing a link is saved once
 * any of them saved, and failed only when none saved and one failed. */
function groupOutcomes(
  session: ShareSession,
  resolved: ResolvedPayload[],
): { entries: ShareEntry[]; saved: boolean; failed: boolean }[] {
  return shareGroups(session.entries, resolved).map((entries) => {
    const saved = entries.some((e) => e.status === "saved");
    return { entries, saved, failed: !saved && entries.some(isFailed) };
  });
}

/** Saved-of-total for the in-flight "Saved N of M" progress label. */
export function countProgress(
  session: ShareSession,
  resolved: ResolvedPayload[],
): { saved: number; total: number } {
  const groups = groupOutcomes(session, resolved);
  return {
    saved: groups.filter((g) => g.saved).length,
    total: groups.length,
  };
}

/** Saved/failed/total for the terminal partial screen. `failed` counts the
 * failed AND unsupported outcomes — both are terminal outcomes the user is told
 * about — so it can be 0 while entries are still pending (the orchestration-
 * error path), which is why the screen words its subtitle from the count. */
export function countPartial(
  session: ShareSession,
  resolved: ResolvedPayload[],
): { saved: number; failed: number; total: number } {
  const groups = groupOutcomes(session, resolved);
  return {
    saved: groups.filter((g) => g.saved).length,
    failed: groups.filter((g) => g.failed).length,
    total: groups.length,
  };
}

/** The failed entries the partial screen lists, one per failed item. */
export function failedEntries(
  session: ShareSession,
  resolved: ResolvedPayload[],
): ShareEntry[] {
  return groupOutcomes(session, resolved)
    .filter((g) => g.failed)
    .map((g) => g.entries.find(isFailed)!);
}

/** Returns a copy of `session` with the entry matching `settled.index` replaced
 * by the settled version, so the saving phase can reflect incremental progress. */
export function withEntry(
  session: ShareSession,
  settled: ShareEntry,
): ShareSession {
  return {
    ...session,
    entries: session.entries.map((e) =>
      e.index === settled.index ? settled : e,
    ),
  };
}

/** The payload list the processor runs against. Normal path: the natively
 * resolved payloads, narrowed to the slice the processor reads. When resolution
 * failed or its results no longer align with the raw payloads — the resolver
 * probes shared URLs with a live request, so bot-hostile hosts (TikTok) can
 * fail the whole resolution — fall back to the raw payloads: for url/text
 * shares the raw value is everything the save needs, and entries the fallback
 * cannot resolve (images) are reported as failed entries instead of killing the
 * share. */
export function selectProcessorPayloads(args: {
  /** `useIncomingShare`'s resolution error, `null` when resolution succeeded. */
  resolutionError: unknown;
  resolved: readonly ResolvedPayload[];
  raw: RawSharePayload[];
}): ResolvedPayload[] {
  if (
    args.resolutionError === null &&
    args.resolved.length === args.raw.length
  ) {
    return args.resolved.map((p) => ({
      contentType: p.contentType,
      value: p.value,
      contentUri: p.contentUri,
      contentMimeType: p.contentMimeType,
    }));
  }
  return resolvedFromRawPayloads(args.raw);
}
