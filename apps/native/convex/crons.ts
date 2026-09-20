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

// Prepare and deliver eligible weekly shelves. The worker is bounded and
// schedules one small transaction per due user.
crons.interval(
  "prepare weekly shelves",
  { hours: 1 },
  internal.notifications.prepareDueWeeklyDigests,
  {},
);

// Drop browser-extension pairing codes nobody redeemed. They expire in ten
// minutes and are checked on redemption, so this is housekeeping rather than a
// guard; bounded to 200 rows per run.
crons.interval(
  "cleanup expired extension pairings",
  { hours: 1 },
  internal.extension.cleanupExpiredPairings,
  {},
);

crons.interval(
  "recover weekly shelf deliveries",
  { minutes: 5 },
  internal.notificationDelivery.recover,
  {},
);

export default crons;
