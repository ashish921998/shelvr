/** The places a ballot may name, and how long a place key or an id may be. */
export const MAX_VOTE_KEYS = 10;
const MAX_KEY_CHARS = 8;
const MAX_TOKEN_CHARS = 64;
const MAX_VOTER_ID_CHARS = 64;

export type PlanVoteBody = {
  token: string;
  voterId: string;
  picks: string[];
  passes: string[];
  /**
   * The visitor's own order for their ballots, so one that left the browser
   * late never replaces a newer one that landed first. Absent from an old
   * page, which then keeps last-write-wins.
   */
  revision?: number;
};

function isKeyList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_VOTE_KEYS &&
    value.every((key) => typeof key === "string" && key.length <= MAX_KEY_CHARS)
  );
}

/**
 * The one reading of a vote page's ballot. The web route forwards the body
 * as it came, so this is where its shape and limits are decided; null when
 * it is not a ballot.
 */
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
  return {
    token,
    voterId,
    picks: fields.picks,
    passes: fields.passes,
    ...(revision === undefined ? {} : { revision }),
  };
}
