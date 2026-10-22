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

export function hasRetryableEntries(session: ShareSession): boolean {
  return entriesToProcess(session).length > 0;
}

const isFailed = (e: ShareEntry) =>
  e.status === "failed" || e.status === "unsupported";

function groupOutcomes(
  session: ShareSession,
  resolved: ResolvedPayload[],
): { saved: boolean; failed: ShareEntry | undefined }[] {
  return shareGroups(session.entries, resolved).map((entries) => {
    const saved = entries.some((e) => e.status === "saved");
    return { saved, failed: saved ? undefined : entries.find(isFailed) };
  });
}

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

export function countPartial(
  session: ShareSession,
  resolved: ResolvedPayload[],
): { saved: number; failed: number; total: number } {
  const groups = groupOutcomes(session, resolved);
  return {
    saved: groups.filter((g) => g.saved).length,
    failed: groups.filter((g) => g.failed !== undefined).length,
    total: groups.length,
  };
}

export function failedEntries(
  session: ShareSession,
  resolved: ResolvedPayload[],
): ShareEntry[] {
  return groupOutcomes(session, resolved).flatMap((g) =>
    g.failed === undefined ? [] : [g.failed],
  );
}

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

export function selectProcessorPayloads(args: {
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
