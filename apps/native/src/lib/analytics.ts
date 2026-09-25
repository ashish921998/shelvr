import {
  SAFE_ERROR_MESSAGES,
  posthog,
  resetIfIdentified as resetClientIfIdentified,
} from "@/lib/posthog";
import type { CancelSurveyReason } from "@convex/model/cancelSurveyFields";
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

/**
 * Which sign-in UI started an OAuth attempt. `$screen_name` cannot tell these
 * apart, because the onboarding route renders both the full-page view and the
 * demo sheet, and only the sheet runs the flow from inside a native modal.
 */
export type OAuthSurface = "sign_in_view" | "demo_sheet";

type AnalyticsEventProperties = {
  onboarding_step_viewed: { step_id: string; step_index: number };
  onboarding_step_completed: {
    step_id: string;
    step_index: number;
    duration_ms: number;
  };
  auth_started: { provider: string; surface: OAuthSurface };
  auth_cancelled: {
    provider: string;
    elapsed_ms: number;
    browser_ms: number;
    surface: OAuthSurface;
    // iOS reports a person backing out and a session that never presented as
    // the same `cancel`, so the fields below carry what the OS said. The
    // NSError domain and code are bounded and carry no user content; the
    // description they come from is not sent, because free-form error text is
    // redacted out of this project's telemetry on purpose.
    result: "cancel" | "dismiss";
    native_error_domain?: string;
    native_error_code?: number;
  };
  auth_failed: {
    provider: string;
    stage: "request" | "browser" | "exchange";
    elapsed_ms: number;
    surface: OAuthSurface;
  };
  // A sign-in that finished in this session. `auth_completed` below is the
  // identify-time signal and also fires on every signed-in cold start.
  auth_succeeded: {
    provider: string;
    elapsed_ms: number;
    surface: OAuthSurface;
  };
  auth_completed: Record<string, never>;
  // Widget snapshot and file cleanup completed, including signed-out startup
  // and foreground recovery. This counts cleanup operations, not sign-outs or
  // confirmed WidgetKit redraws.
  widget_cleared: Record<string, never>;
  // A widget thumbnail could not be built, so the item degraded to its text
  // tile. `reason` separates a bounded timeout (a stalled download or wedged
  // decode) from any other download or decode error. It never carries the
  // image URL or any saved content.
  widget_sync_failed: { reason: "timeout" | "error" };
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
  // Fired only when a bulk import created at least one link.
  links_imported: {
    url_count: number;
    created: number;
    skipped: number;
    invalid: number;
    not_processed: number;
  };
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
  // `share_ref` is set when a branded link went out: a hash of its token that
  // matches the web share page's `share_page_viewed` and `app_store_clicked`.
  item_shared: { surface: "item_detail" | "feed"; share_ref?: string };
  item_link_copied: Record<string, never>;
  item_deleted: { item_type: AnalyticsItem["type"] };
  suggestion_accepted: Record<string, never>;
  suggestion_dismissed: Record<string, never>;
  space_created: { dynamic: boolean };
  space_updated: { dynamic: boolean };
  space_deleted: Record<string, never>;
  space_suggestions_accepted: { suggestion_count: number };
  onboarding_completed: {
    // Always empty since the pileup question was removed. Kept so existing
    // PostHog insights keep a stable property shape.
    save_pileup: string[];
    // The setup step's "What do you save?" kinds, which seed the space presets.
    save_types: string[];
    space_count: number;
    // Preset identities only. Typed names are user content and are counted.
    space_names: string[];
    custom_space_count: number;
    // Mirror the setup answers onto the person so they're durable for
    // segmentation after the (later) sign-in identify merges the anon person.
    $set: { save_pileup: string[]; save_types: string[] };
  };
  // Feedback events never carry message text; see lib/feedback.ts. The
  // submission event fires only after Convex acknowledges persistence — the
  // message itself lives in Convex and the support inbox, never in PostHog.
  feedback_invitation_shown: { surface: string; ready_count: number };
  feedback_invitation_dismissed: { surface: string };
  feedback_opened: { surface: string };
  feedback_submitted: {
    surface: string;
    char_count: number;
    delivery: "scheduled" | "unconfigured";
  };
  // Demo step tracking. Deliberately content-free: no URLs, titles, tags, or
  // space names — only the outcome of the user's one real demo save.
  onboarding_demo_submitted: Record<string, never>;
  onboarding_demo_skipped: Record<string, never>;
  onboarding_demo_result: {
    outcome: "ready" | "failed" | "timeout" | "error" | "already_used";
  };
  shared_content_saved: { item_count: number };
  // Android task-restore ghost: the share screen re-offered a batch that was
  // already handled (recordCompletedShare tombstone matched).
  share_ghost_prompt: Record<string, never>;
  share_ghost_save_again: Record<string, never>;
  share_ghost_dismissed: Record<string, never>;
  // Save recall card on Home (lib/use-save-recall.ts). Counts only: never the
  // saved item's title, tags, or URL.
  save_recall_shown: { match_count: number };
  save_recall_opened: { match_count: number };
  save_recall_dismissed: { match_count: number };
  review_prompted: { ready_count: number };
  trial_reminder_permission: { granted: boolean };
  // Next-visit cancel survey (lib/cancel-survey.ts). Bounded reason ids only,
  // never free text. A response is stated intent, NOT proof of cancellation —
  // only the server-side webhook events (trial_cancelled, …) count as
  // cancellations; funnels must never divide by survey responses.
  // Only the prompted outcome: a cold start that finds an existing grant is
  // not a decision the user just made.
  notification_permission_result: {
    outcome: "granted" | "provisional" | "denied";
  };
  notification_opened: { notification_kind: string; notification_id: string };
  notification_disabled: Record<string, never>;
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
  } catch {
    // Analytics must never change the outcome of a product action.
  }
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
  // Custom names, messages, and stacks can contain user content. Only a
  // known error type is safe for console diagnostics without PostHog.
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
  } catch {
    // Error reporting must never mask or replace the original failure.
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

/** The only reset. Resets only when PostHog still holds an identified user:
 * a signed-out launch keeps its anonymous id, while an explicit sign-out, an
 * account deletion, or an expired session stops attributing events to the
 * previous account once Convex reports it. A device that was never
 * identified has no link to break, so rotating its anonymous id would only
 * split one person's onboarding across two profiles. Invoked solely from
 * `useAnalyticsIdentity` on the auth edge; sign-out flows must not reset
 * analytics themselves. */
async function resetIfIdentified(): Promise<void> {
  if (!posthog) return;

  try {
    await resetClientIfIdentified(posthog);
  } catch {
    // Analytics must never block sign-out.
  }
}

function screen(route: string): void {
  try {
    void posthog?.screen(route, {
      environment: Constants.expoConfig?.extra?.variant ?? "development",
      analytics_version: 1,
    });
  } catch {
    // Screen tracking must never interrupt navigation.
  }
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
