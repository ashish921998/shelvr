import { firstNameOf } from "./firstName";

export const MAX_VOTE_KEYS = 10;
const MAX_KEY_CHARS = 8;
const MAX_TOKEN_CHARS = 64;
const MAX_VOTER_ID_CHARS = 64;
const MAX_VOTER_NAME_CHARS = 64;
const VOTER_NAME = /^[\p{L}\p{M}'’-]+$/u;

export type PlanVoteBody = {
  token: string;
  voterId: string;
  picks: string[];
  passes: string[];
  revision?: number;
  name?: string;
};

type Choice = "pick" | "pass";
type LastVote = { key: string; choice: Choice; at: number };
type VoterRow = {
  name?: string;
  picks: string[];
  passes: string[];
  last?: LastVote;
};
type Ballot = { name?: string; picks: string[]; passes: string[] };

function isKeyList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_VOTE_KEYS &&
    value.every((key) => typeof key === "string" && key.length <= MAX_KEY_CHARS)
  );
}

function isVoterName(value: unknown): value is string | undefined {
  return (
    value === undefined ||
    (typeof value === "string" && value.length <= MAX_VOTER_NAME_CHARS)
  );
}

export function parsePlanVote(body: unknown): PlanVoteBody | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const fields = body as Record<string, unknown>;
  const token = fields.token;
  const voterId =
    typeof fields.voterId === "string" ? fields.voterId.trim() : undefined;
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > MAX_TOKEN_CHARS
  ) {
    return null;
  }
  if (!voterId || voterId.length > MAX_VOTER_ID_CHARS) return null;
  if (!isKeyList(fields.picks) || !isKeyList(fields.passes)) return null;
  const revision = fields.revision;
  if (revision !== undefined) {
    if (typeof revision !== "number" || !Number.isFinite(revision)) {
      return null;
    }
  }
  const name = fields.name;
  if (!isVoterName(name)) return null;
  return {
    token,
    voterId,
    picks: fields.picks,
    passes: fields.passes,
    ...(revision === undefined ? {} : { revision }),
    ...(name === undefined ? {} : { name }),
  };
}

export function planVoterName(raw: string): string | undefined {
  const first = firstNameOf(raw);
  return first !== undefined && VOTER_NAME.test(first) ? first : undefined;
}

function newestAdded(
  keys: string[],
  before: string[],
  order: string[],
): string | undefined {
  let newest: string | undefined;
  for (const key of keys) {
    if (before.includes(key)) continue;
    if (newest === undefined || order.indexOf(key) > order.indexOf(newest)) {
      newest = key;
    }
  }
  return newest;
}

function newestChoice(
  previous: VoterRow | null,
  ballot: Ballot,
  order: string[],
  now: number,
): LastVote | undefined {
  const pick = newestAdded(ballot.picks, previous?.picks ?? [], order);
  if (pick !== undefined) return { key: pick, choice: "pick", at: now };
  const pass = newestAdded(ballot.passes, previous?.passes ?? [], order);
  if (pass !== undefined) return { key: pass, choice: "pass", at: now };
  const last = previous?.last;
  if (last === undefined) return undefined;
  const kept = last.choice === "pick" ? ballot.picks : ballot.passes;
  return kept.includes(last.key) ? last : undefined;
}

export function voterFields(
  previous: VoterRow | null,
  ballot: Ballot,
  order: string[],
  now: number,
): { name: string | undefined; last: LastVote | undefined } {
  return {
    name:
      ballot.name === undefined ? previous?.name : planVoterName(ballot.name),
    last: newestChoice(previous, ballot, order, now),
  };
}

export function latestVote(
  votes: VoterRow[],
  places: { key: string; name: string }[],
): { name?: string; place: string; choice: Choice } | undefined {
  let latest: { vote: VoterRow; last: LastVote; place: string } | undefined;
  for (const vote of votes) {
    const last = vote.last;
    const place = places.find((shown) => shown.key === last?.key);
    if (last === undefined || place === undefined) continue;
    if (latest === undefined || last.at > latest.last.at) {
      latest = { vote, last, place: place.name };
    }
  }
  if (latest === undefined) return undefined;
  return {
    ...(latest.vote.name !== undefined ? { name: latest.vote.name } : {}),
    place: latest.place,
    choice: latest.last.choice,
  };
}
