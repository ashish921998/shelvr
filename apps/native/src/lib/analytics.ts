import {
  SAFE_ERROR_MESSAGES,
  posthog,
  resetIfIdentified as resetClientIfIdentified,
} from "@/lib/posthog";
import type { CancelSurveyReason } from "@convex/model/cancelSurveyFields";
import type { SaveSource } from "@convex/model/saveSource";
import type { SaveFailureStage } from "@convex/model/saveErrors";
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

type ItemAction =
  | "copy"
  | "share"
  | "share_sheet_opened"
  | "open_source"
  | "open_maps"
  | "web_search"
  | "call"
  | "email"
  | "message"
  | "calendar_sheet_opened"
  | "note_edited";

export type ImageSaveFailureReason = "photo_limit" | "too_large" | "other";

export type OAuthSurface = "sign_in_view" | "demo_sheet" | "sample_preview";
export type AuthMethod = "native" | "web";

export type TrialEligibility =
  | "eligible"
  | "ineligible"
  | "no_intro"
  | "unknown";

export type PaywallContext = {
  offering_id?: string;
  trial_eligible?: TrialEligibility;
};

export type PaywallAttemptProperties = {
  placement: string;
  paywall_attempt_id: string;
  source_placement?: string;
} & PaywallContext;

type PaywallOutcomeProperties = PaywallAttemptProperties & {
  duration_ms: number;
};

type SaveKind = "link" | "note" | "image";

type NextUpKind = "read" | "cook" | "watch" | "open";

export type AnalyticsEventProperties = {
  onboarding_step_viewed: {
    step_id: string;
    step_index: number;
    flow_version: number;
  };
  onboarding_step_completed: {
    step_id: string;
    step_index: number;
    flow_version: number;
    duration_ms: number;
  };
  onboarding_opener_page_viewed: { page_index: number };
  auth_started: {
    provider: string;
    method: AuthMethod;
    surface: OAuthSurface;
    auth_attempt_id: string;
  };
  auth_cancelled: {
    provider: string;
    method: AuthMethod;
    auto_retry?: true;
    elapsed_ms: number;
    browser_ms: number;
    surface: OAuthSurface;
    auth_attempt_id: string;
    // iOS reports a person backing out and a session that never presented as the same cancel.
    result: "cancel" | "dismiss";
    native_error_domain?: string;
    native_error_code?: number;
  };
  auth_failed: {
    provider: string;
    method: AuthMethod;
    auto_retry?: true;
    stage: "request" | "browser" | "exchange";
    error_code?: string;
    elapsed_ms: number;
    surface: OAuthSurface;
    auth_attempt_id: string;
  };
  auth_succeeded: {
    provider: string;
    method: AuthMethod;
    auto_retry?: true;
    elapsed_ms: number;
    surface: OAuthSurface;
    auth_attempt_id: string;
  };
  auth_completed: Record<string, never>;
  widget_cleared: Record<string, never>;
  widget_sync_failed: { reason: "timeout" | "error" };
  paywall_requested: PaywallAttemptProperties;
  paywall_presentation_started: PaywallAttemptProperties;
  paywall_shown: PaywallOutcomeProperties;
  paywall_cancelled: PaywallOutcomeProperties;
  paywall_purchase_completed: PaywallOutcomeProperties & {
    product_id?: string;
  };
  paywall_restored: PaywallOutcomeProperties & { product_id?: string };
  paywall_failed: PaywallAttemptProperties & {
    reason: string;
    duration_ms: number;
  };
  entitlement_activated: {
    status: "trialing" | "pro" | "lifetime";
    source: "purchase" | "restore";
    delay_ms: number;
  };
  paywall_blocked_action_resumed: {
    placement: string;
    delay_ms: number;
    purchased_since_block: boolean;
  };
  item_opened: ItemProperties & { source: string };
  item_action: ItemProperties & { action: ItemAction };
  save_attempt_started: {
    save_source: SaveSource;
    save_kind: SaveKind;
    operation_id?: string;
  };
  save_failed: {
    save_source: SaveSource;
    save_kind: SaveKind;
    stage: SaveFailureStage;
    operation_id?: string;
  };
  article_saved: Record<string, never>;
  note_saved: Record<string, never>;
  images_saved: { image_count: number };
  images_save_failed: { reason: ImageSaveFailureReason; image_count: number };
  photo_captured: { capture_mode: "photo" | "sticker" };
  item_space_membership_changed: {
    membership_added: boolean;
    item_id: string;
    space_id: string;
    undone: boolean;
  };
  item_shared: { surface: "item_detail" | "feed"; share_ref?: string };
  item_link_copied: Record<string, never>;
  item_deleted: { item_type: AnalyticsItem["type"] };
  suggestion_accepted: Record<string, never>;
  suggestion_dismissed: Record<string, never>;
  space_created: { dynamic: boolean; auto_file: boolean };
  space_updated: { dynamic: boolean; auto_file: boolean };
  space_deleted: Record<string, never>;
  space_suggestions_accepted: { suggestion_count: number };
  plan_made: { considered: number; place_count: number };
  plan_failed: { reason: "ai_consent" | "error" };
  plan_picked: { place_count: number };
  plan_place_opened: { rank: number };
  plan_place_visited: { visited: boolean };
  plan_shared: { place_count: number; picked: boolean };
  plan_asked: { place_count: number };
  plan_ask_failed: { reason: "link" | "share" };
  trip_made: {
    considered: number;
    days: number;
    pace: "easy" | "balanced" | "packed";
    made: boolean;
  };
  trip_failed: { reason: "ai_consent" | "error" };
  trip_stop_opened: { day: number; stop: number };
  trip_directions_opened: { located: boolean };
  trip_stop_swapped: { day: number };
  onboarding_completed: {
    save_pileup: string[];
    save_types: string[];
    interests: string[];
    travel_vibes: string[];
    // The city picked for the sample trip under Travel (flow 12 on), one of
    // the fixed sample cities; null for "Not sure yet" or no Travel.
    sample_city: string | null;
    space_count: number;
    space_names: string[];
    custom_space_count: number;
    $set: { save_pileup: string[]; save_types: string[] };
  };
  feedback_invitation_shown: { surface: string; ready_count: number };
  feedback_invitation_dismissed: { surface: string };
  feedback_opened: { surface: string };
  feedback_submitted: {
    surface: string;
    char_count: number;
    delivery: "scheduled" | "unconfigured";
  };
  onboarding_demo_submitted: Record<string, never>;
  onboarding_demo_skipped: Record<string, never>;
  onboarding_demo_deferred: { sample: boolean };
  onboarding_demo_picked: { sample: boolean; signed_in: boolean };
  onboarding_signin_prompt: {
    surface: "demo_sheet" | "sample_preview";
    action: "shown" | "dismissed";
  };
  onboarding_share_practice: {
    outcome:
      | "received"
      | "other_app"
      | "dismissed"
      | "sheet_stuck"
      | "skipped"
      | "sheet_failed";
  };
  onboarding_reminder: {
    action: "remind" | "skip";
    slot: "tonight" | "tomorrow" | "weekend" | "nextWeek";
    granted: boolean;
  };
  onboarding_demo_result: {
    outcome: "ready" | "failed" | "timeout" | "error" | "already_used";
  };
  shared_content_saved: { item_count: number };
  // Android replays a share on task restore; counts the replays the share screen skipped.
  share_ghost_skipped: Record<string, never>;
  save_recall_shown: { match_count: number };
  save_recall_opened: { match_count: number };
  save_recall_dismissed: { match_count: number };
  next_up_shown: { kind: NextUpKind };
  next_up_opened: { kind: NextUpKind };
  next_up_dismissed: { kind: NextUpKind };
  save_progress_card_shown: { saved: number };
  save_progress_card_action: {
    action: "photos" | "note" | "dismiss";
    saved: number;
  };
  save_goal_reached: {
    goal: number;
    hours_since_start: number;
    card_dismissed: boolean;
  };
  review_prompted: { ready_count: number };
  trial_reminder_permission: { granted: boolean };
  trial_reminder_primer: { outcome: "accepted" | "declined" };
  welcome_save_shown: { trial: boolean };
  welcome_save_action: { action: "save" | "dismiss"; trial: boolean };
  notification_permission_result: {
    outcome: "granted" | "provisional" | "denied";
  };
  notification_opened: { notification_kind: string; notification_id: string };
  notification_disabled: {
    notification_kind: "weekly_shelf" | "save_reminders";
  };
  ai_consent_shown: Record<string, never>;
  ai_consent_answered: {
    granted: boolean;
    surface: "card" | "settings" | "sign_in";
  };
  cancel_survey_shown: Record<string, never>;
  cancel_survey_dismissed: Record<string, never>;
  cancel_survey_submitted: {
    reason: CancelSurveyReason;
    survey_source: "next_visit_card";
  };
};

type AnalyticsEvent = keyof AnalyticsEventProperties;

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
  } catch {}
}

const SAFE_ERROR_NAMES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "EvalError",
  "AggregateError",
  "AbortError",
]);

function captureError(
  event: string,
  error: unknown,
  properties: Record<string, string | number | boolean> = {},
): void {
  const errorType =
    error instanceof Error
      ? SAFE_ERROR_NAMES.has(error.name)
        ? error.name
        : "Error"
      : "Unknown";
  console.error(event, { error_type: errorType });
  if (!posthog) return;

  try {
    const original = error instanceof Error ? error : new Error(typeof error);
    const reported =
      !(error instanceof Error) || SAFE_ERROR_MESSAGES.has(original.message)
        ? original
        : Object.assign(new Error(original.name), {
            name: original.name,
            stack: original.stack,
          });
    posthog.captureException(reported, {
      ...properties,
      error_event: event,
      environment: Constants.expoConfig?.extra?.variant ?? "development",
      analytics_version: 1,
    });
  } catch {}
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

const OPENED_SOURCES = new Set(["home", "space", "search", "digest", "map"]);

function itemOpened(item: AnalyticsItem, source: string): void {
  if (!item.fixtureKey)
    capture("item_opened", {
      ...itemProperties(item),
      source: OPENED_SOURCES.has(source) ? source : "direct",
    });
}

function itemAction(item: AnalyticsItem, action: ItemAction): void {
  if (!item.fixtureKey)
    capture("item_action", { ...itemProperties(item), action });
}

function identify(userId: string): void {
  if (!posthog) return;

  try {
    posthog.identify(userId);
  } catch {}
}

/** Resets only an identified PostHog user, since a reset rotates the anonymous id; call only from `useAnalyticsIdentity`. */
async function resetIfIdentified(): Promise<void> {
  if (!posthog) return;

  try {
    await resetClientIfIdentified(posthog);
  } catch {}
}

function screen(route: string): void {
  try {
    void posthog?.screen(route, {
      environment: Constants.expoConfig?.extra?.variant ?? "development",
      analytics_version: 1,
    });
  } catch {}
}

export const analytics = {
  capture,
  captureError,
  identify,
  resetIfIdentified,
  sessionId,
  screen,
  itemOpened,
  itemAction,
};
