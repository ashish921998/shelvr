"use node";

import type { FunctionReturnType } from "convex/server";
import { v } from "convex/values";
import { action, env } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  appleMapsAccessToken,
  appleMapsConfig,
  appleMapsSearchPlaces,
} from "./model/appleMaps";
import {
  fillTargets,
  keepDateSuggestion,
  MIN_SAVED_EVENINGS,
  rankEvenings,
  savedDateStops,
  SLOT_SEARCHES,
  suggestedDateStop,
  type DateCandidate,
  type ScoredStop,
} from "./model/dateRank";
import {
  DATE_KINDS,
  dateAskValidator,
  datePlanResultValidator,
  type DateAsk,
  type DateKind,
  type DatePlanResult,
} from "./model/datePlan";
import { logEvent } from "./model/log";
import { placeKey, suggestSavedPlaces } from "./model/plan";
import { dropStrays } from "./model/trip";
import { chainNames, saveWhy } from "./model/tripSuggest";
import { appleLang, pinFor } from "./tripPlanner";

/** The whole Apple search, token included, gives up after this and the saves plan alone. */
const FILL_DEADLINE_MS = 10_000;
/** Suggestions kept around each anchor, so a swap has somewhere to go. */
const SUGGESTIONS_PER_ANCHOR = 3;

type Claim = FunctionReturnType<
  typeof internal.datePlanData.claimDatePlanInternal
>;

/** The city's unvisited saved places that already have a pin; a date never looks one up. */
function savedCandidates(claim: Claim): DateCandidate[] {
  const been = new Set(claim.been.map(placeKey));
  const places = suggestSavedPlaces(
    claim.sources,
    been,
    Number.MAX_SAFE_INTEGER,
  );
  const pinned = dropStrays(places.map((place) => pinFor(place, claim.pins)));
  const sources = new Map(
    claim.sources.map((source) => [source.itemId, source]),
  );
  const saves = new Map(claim.saves.map((save) => [save.itemId, save]));
  return places.flatMap((place, i) => {
    const pin = pinned[i];
    const source = sources.get(place.itemId);
    const save = saves.get(place.itemId);
    if (!pin || !source || !save) return [];
    const why = saveWhy(place, source);
    return [
      {
        itemId: place.itemId,
        name: place.name,
        ...(place.area ? { area: place.area } : {}),
        ...(why ? { why } : {}),
        lat: pin.lat,
        lng: pin.lng,
        ...(pin.appleId !== undefined ? { appleId: pin.appleId } : {}),
        ...(pin.category !== undefined ? { category: pin.category } : {}),
        tags: save.tags,
        ownTags: save.ownTags,
        savedAt: save.savedAt,
      },
    ];
  });
}

/** The kind to plan: the one asked for, or for "surprise" one the saves can make an evening of. */
function chooseKind(
  ask: DateAsk,
  candidates: DateCandidate[],
  now: number,
): { kind: DateKind; scored: ScoredStop[] } {
  if (ask !== "surprise") {
    return { kind: ask, scored: savedDateStops(ask, candidates, now) };
  }
  const options = [...DATE_KINDS]
    .sort(() => Math.random() - 0.5)
    .map((kind) => ({ kind, scored: savedDateStops(kind, candidates, now) }));
  return (
    options.find((option) => rankEvenings(option.scored).evenings.length > 0) ??
    options.find((option) => option.scored.length > 0) ??
    options[0]
  );
}

/** Runs `work`, and at `ms` aborts its fetches and settles on `fallback`. */
function withDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  const deadline = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      deadline.abort();
      resolve(fallback);
    }, ms);
  });
  return Promise.race([work(deadline.signal), late]).finally(() =>
    clearTimeout(timer),
  );
}

/** `fetch` that also stops when `signal` aborts, on top of each request's own timeout. */
function fetchUntil(signal: AbortSignal): typeof fetch {
  return (input, init) =>
    fetch(input, {
      ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal,
    });
}

/** Apple Maps places for the stop each top saved place is missing: one search per anchor. */
async function suggestStops(
  kind: DateKind,
  scored: ScoredStop[],
  been: ReadonlySet<string>,
  lang: string | undefined,
  signal: AbortSignal,
): Promise<{ stops: ScoredStop[]; searches: number }> {
  const config = appleMapsConfig(env);
  if (config === null) {
    logEvent("info", "date_plan_maps_unconfigured", {});
    return { stops: [], searches: 0 };
  }
  const fetchImpl = fetchUntil(signal);
  const token = await appleMapsAccessToken(config, fetchImpl);
  if (signal.aborted) return { stops: [], searches: 0 };
  if (token === null) {
    logEvent("warn", "date_plan_map_token_failed", {});
    return { stops: [], searches: 0 };
  }
  const targets = fillTargets(scored);
  const replies = await Promise.all(
    targets.map(({ anchor, slot }) =>
      appleMapsSearchPlaces(
        token,
        SLOT_SEARCHES[kind][slot].query,
        {
          near: anchor,
          categories: SLOT_SEARCHES[kind][slot].categories,
          ...(lang !== undefined ? { lang } : {}),
        },
        fetchImpl,
      ),
    ),
  );
  const chains = chainNames(replies.flat());
  const taken = scored.map((entry) => entry.stop);
  const stops: ScoredStop[] = [];
  targets.forEach(({ anchor, slot }, i) => {
    let kept = 0;
    for (const found of replies[i]) {
      if (kept >= SUGGESTIONS_PER_ANCHOR) break;
      if (
        !keepDateSuggestion(found, { kind, slot, anchor, been, taken, chains })
      )
        continue;
      kept++;
      const stop = suggestedDateStop(found, slot);
      taken.push(stop);
      stops.push({ stop, score: 0 });
    }
  });
  return { stops, searches: targets.length };
}

function listCandidates(claim: Claim): DateCandidate[] {
  const been = new Set(claim.been.map(placeKey));
  return claim.places
    .filter((place) => !been.has(placeKey(place.name)))
    .map(({ key: _key, addedAt, ...place }) => ({
      ...place,
      ownTags: true,
      savedAt: addedAt,
    }));
}

export const makeDatePlan = action({
  args: {
    city: v.string(),
    kind: dateAskValidator,
    locale: v.optional(v.string()),
    listId: v.optional(v.id("sharedLists")),
  },
  returns: datePlanResultValidator,
  // Annotated: inferring through `internal` is circular for an action.
  handler: async (ctx, args): Promise<DatePlanResult> => {
    const claim: Claim = await ctx.runMutation(
      internal.datePlanData.claimDatePlanInternal,
      {
        city: args.city,
        ...(args.listId !== undefined ? { listId: args.listId } : {}),
      },
    );
    const now = Date.now();
    const candidates = [...savedCandidates(claim), ...listCandidates(claim)];
    const { kind, scored } = chooseKind(args.kind, candidates, now);
    const fields = {
      kind,
      asked: args.kind,
      saved_stops: scored.length,
      ai_allowed: claim.aiAllowed,
    };
    if (scored.length === 0) {
      logEvent("info", "date_plan_no_anchor", fields);
      return {
        status: "no_anchor",
        city: claim.city,
        kind,
        stops: [],
        evenings: [],
      };
    }
    let plan = rankEvenings(scored);
    let suggested = 0;
    let searches = 0;
    // Saved places reach Apple only as points to search around, and only while AI is allowed,
    // as they do for trips. Whatever Apple does, the saves alone still plan.
    if (plan.evenings.length < MIN_SAVED_EVENINGS && claim.aiAllowed) {
      const been = new Set(claim.been.map(placeKey));
      const found = await withDeadline(
        (signal) =>
          suggestStops(
            kind,
            scored,
            been,
            appleLang(args.locale),
            signal,
          ).catch((error: unknown) => {
            logEvent("warn", "date_plan_suggest_failed", {
              error_name: error instanceof Error ? error.name : "unknown",
            });
            return { stops: [], searches: 0 };
          }),
        FILL_DEADLINE_MS,
        { stops: [], searches: -1 },
      );
      searches = found.searches;
      if (found.stops.length > 0) {
        const withSuggestions = rankEvenings([...scored, ...found.stops]);
        if (withSuggestions.evenings.length > plan.evenings.length) {
          plan = withSuggestions;
          suggested = found.stops.length;
        }
      }
    }
    const status = plan.evenings.length > 0 ? "ready" : "no_pair";
    logEvent("info", "date_plan_made", {
      ...fields,
      status,
      evenings: plan.evenings.length,
      suggested,
      searches,
    });
    return { status, city: claim.city, kind, ...plan };
  },
});
