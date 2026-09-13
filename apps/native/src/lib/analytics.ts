import { posthog } from "@/lib/posthog";
import Constants from "expo-constants";

export type AnalyticsItem = {
  _id: string;
  _creationTime: number;
  type: "image" | "link" | "note";
  fixtureKey?: string;
};

type ItemProperties = {
  item_id: string;
  item_type: AnalyticsItem["type"];
  saved_at: number;
  item_age_ms: number;
};

export type ItemAction =
  | "copy"
  | "share"
  | "share_sheet_opened"
  | "open_source"
  | "open_maps"
  | "web_search"
  | "call"
  | "email"
  | "message"
  | "calendar_sheet_opened";

export type ImageSaveFailureReason = "photo_limit" | "too_large" | "other";

/** Bounded reason ids for the next-visit cancel survey (lib/cancel-survey.ts). */
export type CancelSurveyReason =
  | "too_expensive"
  | "not_useful_enough"
  | "missing_feature"
  | "other";

export type AnalyticsEventProperties = {
  onboarding_step_viewed: { step_id: string; step_index: number };
  onboarding_step_completed: {
    step_id: string;
    step_index: number;
    duration_ms: number;
  };
  auth_started: { provider: string };
  auth_cancelled: { provider: string };
  auth_failed: { provider: string };
  auth_completed: Record<string, never>;
  paywall_requested: { placement: string; paywall_attempt_id: string };
  paywall_presentation_started: {
    placement: string;
    paywall_attempt_id: string;
  };
  paywall_shown: {
    placement: string;
    paywall_attempt_id: string;
    duration_ms: number;
  };
  paywall_cancelled: {
    placement: string;
    paywall_attempt_id: string;
    duration_ms: number;
  };
  paywall_purchase_completed: {
    placement: string;
    paywall_attempt_id: string;
    duration_ms: number;
  };
  paywall_restored: {
    placement: string;
    paywall_attempt_id: string;
    duration_ms: number;
  };
  paywall_failed: {
    placement: string;
    paywall_attempt_id: string;
    reason: string;
    duration_ms: number;
  };
  item_opened: ItemProperties & { source: string };
  item_action: ItemProperties & { action: ItemAction };
  article_saved: Record<string, never>;
  note_saved: Record<string, never>;
  images_saved: { image_count: number };
  // Photo saves fail as data, never as thrown errors, so error tracking never
  // sees them. `reason` is one of three fixed words, never the message text.
  images_save_failed: { reason: ImageSaveFailureReason; image_count: number };
  photo_captured: { capture_mode: "photo" | "sticker" };
  item_space_membership_changed: {
    membership_added: boolean;
    item_id: string;
    space_id: string;
    undone: boolean;
  };
  item_shared: Record<string, never>;
  item_link_copied: Record<string, never>;
  item_deleted: { item_type: AnalyticsItem["type"] };
  suggestion_accepted: Record<string, never>;
  suggestion_dismissed: Record<string, never>;
  space_created: { dynamic: boolean };
  space_updated: { dynamic: boolean };
  space_deleted: Record<string, never>;
  space_suggestions_accepted: { suggestion_count: number };
  onboarding_completed: {
    // Q1 "Where do your saves pile up today?" — free analytics signal.
    save_pileup: string[];
    // Q2 "What do you save most?" — also seeds the space presets.
    save_types: string[];
    space_count: number;
    space_names: string[];
    // Mirror the survey answers onto the person so they're durable for
    // segmentation after the (later) sign-in identify merges the anon person.
    $set: { save_pileup: string[]; save_types: string[] };
  };
  // Feedback events never carry message text; see lib/feedback.ts.
  feedback_invitation_shown: { surface: string; ready_count: number };
  feedback_invitation_dismissed: { surface: string };
  feedback_opened: { surface: string };
  // Demo step tracking. Deliberately content-free: no URLs, titles, tags, or
  // space names — only the outcome of the user's one real demo save.
  onboarding_demo_submitted: Record<string, never>;
  onboarding_demo_result: {
    outcome: "ready" | "failed" | "timeout" | "error" | "already_used";
  };
  onboarding_demo_skipped: Record<string, never>;
  shared_content_saved: { item_count: number };
  review_prompted: { ready_count: number };
  // Next-visit cancel survey (lib/cancel-survey.ts). Bounded reason ids only,
  // never free text. A response is stated intent, NOT proof of cancellation —
  // only the server-side webhook events (trial_cancelled, …) count as
  // cancellations; funnels must never divide by survey responses.
  cancel_survey_shown: Record<string, never>;
  cancel_survey_dismissed: Record<string, never>;
  cancel_survey_submitted: {
    reason: CancelSurveyReason;
    survey_source: "next_visit_card";
  };
};

export type AnalyticsEvent = keyof AnalyticsEventProperties;

function capture<Event extends AnalyticsEvent>(
  event: Event,
  properties?: AnalyticsEventProperties[Event],
): void {
  if (!posthog) return;

  try {
    posthog.capture(event, {
      ...properties,
      environment: Constants.expoConfig?.extra?.variant ?? "development",
      analytics_version: 1,
    });
  } catch {
    // Analytics must never change the outcome of a product action.
  }
}

function sessionId(): string | undefined {
  try {
    return posthog?.getSessionId() || undefined;
  } catch {
    return undefined;
  }
}

function itemProperties(item: AnalyticsItem): ItemProperties {
  return {
    item_id: item._id,
    item_type: item.type,
    saved_at: item._creationTime,
    item_age_ms: Math.max(0, Date.now() - item._creationTime),
  };
}

function itemOpened(item: AnalyticsItem, source: string): void {
  if (!item.fixtureKey)
    capture("item_opened", {
      ...itemProperties(item),
      source: ["home", "space", "search"].includes(source) ? source : "direct",
    });
}

function itemAction(item: AnalyticsItem, action: ItemAction): void {
  if (!item.fixtureKey)
    capture("item_action", { ...itemProperties(item), action });
}

// The Convex user id is the whole identity PostHog needs. The email stays in
// Convex: sending it as a person property would copy PII into a third party
// (and into replay-linked person profiles) for no analytics gain.
function identify(userId: string): void {
  if (!posthog) return;

  try {
    posthog.identify(userId);
  } catch {
    // Analytics must never block authentication or app rendering.
  }
}

function reset(): void {
  if (!posthog) return;

  try {
    posthog.reset();
    posthog.register({
      environment: Constants.expoConfig?.extra?.variant ?? "development",
      analytics_version: 1,
    });
  } catch {
    // Analytics must never block sign-out.
  }
}

function screen(route: string): void {
  try {
    posthog?.screen(route, {
      environment: Constants.expoConfig?.extra?.variant ?? "development",
      analytics_version: 1,
    });
  } catch {
    // Screen tracking must never interrupt navigation.
  }
}

export const analytics = {
  capture,
  identify,
  reset,
  sessionId,
  screen,
  itemOpened,
  itemAction,
};
