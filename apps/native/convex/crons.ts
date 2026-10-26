import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup unattached storage",
  { hours: 24 },
  internal.items.cleanupOrphanStorage,
  {},
);

crons.interval(
  "retry refund consent sync",
  { minutes: 1 },
  internal.legalConsent.retry,
  {},
);

crons.interval(
  "cleanup stale image imports",
  { hours: 6 },
  internal.items.cleanupStaleImageImports,
  {},
);

crons.interval(
  "fail stale processing items",
  { minutes: 10 },
  internal.items.failStaleProcessingItems,
  {},
);

crons.interval(
  "retry waitlist resend sync",
  { hours: 1 },
  internal.waitlist.retryFailedResendSyncs,
  {},
);

crons.interval(
  "retry feedback inbox delivery",
  { hours: 1 },
  internal.feedback.retryFailedDeliveries,
  {},
);

crons.interval(
  "purge expired plan vote links",
  { hours: 24 },
  internal.planShares.purgeExpiredPlanShares,
  {},
);

crons.interval(
  "prepare weekly shelves",
  { hours: 1 },
  internal.notifications.prepareDueWeeklyDigests,
  {},
);

crons.interval(
  "prepare save reminders",
  { hours: 1 },
  internal.notifications.prepareDueSaveReminders,
  {},
);

crons.interval(
  "sweep item embeddings",
  { minutes: 30 },
  internal.aiEmbeddingSweep.sweepItemEmbeddings,
  {},
);

crons.interval(
  "recover notification deliveries",
  { minutes: 5 },
  internal.notificationDelivery.recover,
  {},
);

crons.interval(
  "purge expired payment receipts",
  { hours: 24 },
  internal.paymentTelemetry.purgeExpiredReceipts,
  {},
);

crons.interval(
  "recover expired subscriptions",
  { minutes: 1 },
  internal.subscriptions.recoverExpiredSubscriptions,
  {},
);

crons.interval(
  "confirm legacy unsynced waitlist requests",
  { hours: 1 },
  internal.waitlist.requestLegacyConfirmations,
  {},
);

export default crons;
