import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "retry refund consent sync",
  { minutes: 1 },
  internal.legalConsent.retry,
  {},
);

// Sweep a bounded page of stale pending image operations (their attached upload
// was never finalized) so unreferenced storage objects don't accumulate. The
// mutation processes at most 100 rows per run; unbounded scans are avoided.
crons.interval(
  "cleanup stale image imports",
  { hours: 6 },
  internal.items.cleanupStaleImageImports,
  {},
);

// Fail `processing` items whose pipeline run is older than PROCESSING_STALE_MS
// (15 min). Their action died outside its try block, so nothing else will ever
// flip them and the client would spin forever. Bounded to 100 rows per run;
// a full page that made progress chains itself. Every 10 minutes keeps the
// worst-case wait (threshold + one interval) at about 25 minutes.
crons.interval(
  "fail stale processing items",
  { minutes: 10 },
  internal.items.failStaleProcessingItems,
  {},
);

// Retry Resend projection for waitlist rows that saved but never synced, so a
// provider outage does not leave signups unrecoverable.
crons.interval(
  "retry waitlist resend sync",
  { hours: 1 },
  internal.waitlist.retryFailedResendSyncs,
  {},
);

// Deliver feedback rows whose first attempt never ran or failed, and pick up
// `unconfigured` rows once the support-inbox env vars appear. Bounded and
// index-backed; capped rows stay `failed` for manual inspection.
crons.interval(
  "retry feedback inbox delivery",
  { hours: 1 },
  internal.feedback.retryFailedDeliveries,
  {},
);

// Prepare and deliver eligible weekly shelves. The worker is bounded and
// schedules one small transaction per due user.
crons.interval(
  "prepare weekly shelves",
  { hours: 1 },
  internal.notifications.prepareDueWeeklyDigests,
  {},
);

// Embed items whose vector is missing or from an older generation: the
// backfill for saves made before embeddings existed, the repair path for a
// classification whose embed call failed, and the migration path after a
// version bump. A page that made progress chains itself, so this interval is
// only how often a drained sweep re-checks; it costs one indexed read when
// there is nothing to do.
crons.interval(
  "sweep item embeddings",
  { minutes: 30 },
  internal.ai.sweepItemEmbeddings,
  {},
);

crons.interval(
  "recover weekly shelf deliveries",
  { minutes: 5 },
  internal.notificationDelivery.recover,
  {},
);

export default crons;
