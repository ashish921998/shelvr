import { readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { AnalyticsEventProperties } from "./analytics";
import {
  ONBOARDING_FLOW_VERSION,
  ONBOARDING_STEP_IDS,
} from "./onboarding-steps";

type SwiftStatus = "sent" | { missing: string };

const SHARE_RESULT = "Swift shares with ShareLink, which reports no result";
const PASSPORT = "Passport views wait for PR 913";
const RETIRED = "Expo no longer sends it";
const SPOT_REVIEW = "The Swift reveal has no place removal yet";

const SWIFT: Record<keyof AnalyticsEventProperties, SwiftStatus> = {
  onboarding_step_viewed: "sent",
  onboarding_step_completed: "sent",
  onboarding_completed: "sent",
  onboarding_notifications: "sent",
  onboarding_opener_page_viewed: "sent",
  onboarding_demo_submitted: "sent",
  onboarding_share_practice: { missing: RETIRED },
  notification_permission_result: "sent",
  notification_disabled: "sent",
  notification_opened: "sent",
  auth_started: "sent",
  auth_cancelled: "sent",
  auth_failed: "sent",
  auth_succeeded: "sent",
  auth_completed: "sent",
  welcome_save_shown: { missing: "Swift has no welcome letter" },
  welcome_save_action: { missing: "Swift has no welcome letter" },
  feedback_invitation_shown: { missing: "Swift has no feedback invitation" },
  feedback_invitation_dismissed: {
    missing: "Swift has no feedback invitation",
  },
  feedback_opened: "sent",
  feedback_submitted: "sent",
  item_opened: "sent",
  item_action: "sent",
  item_deleted: "sent",
  item_shared: { missing: "Swift item detail has no share action" },
  item_link_copied: { missing: "Swift item detail has no copy action" },
  item_space_membership_changed: { missing: RETIRED },
  images_saved: "sent",
  images_save_failed: "sent",
  article_saved: "sent",
  note_saved: { missing: RETIRED },
  photo_captured: { missing: RETIRED },
  save_attempt_started: "sent",
  save_failed: "sent",
  shared_content_saved: "sent",
  share_ghost_skipped: { missing: "Swift shares have no ghost session" },
  share_spots_revealed: "sent",
  share_spots_skipped: "sent",
  share_spots_city_opened: "sent",
  share_spots_place_removed: { missing: SPOT_REVIEW },
  share_spots_place_restored: { missing: SPOT_REVIEW },
  share_spots_fix_opened: { missing: SPOT_REVIEW },
  share_spots_left: { missing: SPOT_REVIEW },
  widget_cleared: "sent",
  widget_sync_failed: "sent",
  map_opened: "sent",
  map_place_opened: "sent",
  map_filter_selected: "sent",
  map_search_result_opened: "sent",
  map_trip_continued: { missing: "Swift Map has no continue-trip pill" },
  city_opened: "sent",
  city_place_visited: "sent",
  city_plan_started: "sent",
  city_card_share_sheet_opened: "sent",
  go_out_opened: "sent",
  go_out_spot_opened: "sent",
  date_plan_started: "sent",
  date_plan_made: "sent",
  date_plan_failed: "sent",
  date_plan_swapped: "sent",
  date_plan_stop_opened: "sent",
  date_plan_go: { missing: "Swift has no go-to-first-stop button" },
  date_plan_sent: { missing: SHARE_RESULT },
  plan_ask_opened: "sent",
  plan_ask_failed: "sent",
  plan_asked: { missing: SHARE_RESULT },
  plan_votes_seen: "sent",
  plan_link_reshared: { missing: "Swift has no vote link reshare row" },
  plan_made: { missing: RETIRED },
  plan_failed: { missing: RETIRED },
  plan_picked: { missing: RETIRED },
  plan_shared: { missing: RETIRED },
  plan_place_opened: { missing: RETIRED },
  plan_place_visited: { missing: RETIRED },
  trip_plan_started: "sent",
  trip_plan_made: "sent",
  trip_plan_failed: "sent",
  trip_plan_opened: "sent",
  trip_plan_deleted: "sent",
  trip_plan_renamed: "sent",
  trip_plan_edit_started: { missing: "Swift trips have no edit mode" },
  trip_plan_edit_undone: "sent",
  trip_plan_stop_added: "sent",
  trip_plan_stop_moved: "sent",
  trip_plan_stop_removed: "sent",
  trip_plan_stop_opened: "sent",
  trip_plan_place_searched: "sent",
  trip_blank_created: "sent",
  trip_day_suggestions_applied: {
    missing: "Swift trips have no day suggestions",
  },
  trip_made: { missing: RETIRED },
  trip_failed: { missing: RETIRED },
  trip_stop_opened: { missing: RETIRED },
  trip_stop_swapped: { missing: RETIRED },
  trip_directions_opened: { missing: RETIRED },
  shared_list_created: "sent",
  shared_list_opened: "sent",
  shared_list_join_tapped: "sent",
  shared_list_joined: "sent",
  shared_list_left: "sent",
  shared_list_name_prompt: "sent",
  shared_list_place_added: "sent",
  shared_list_place_opened: {
    missing: "Swift shared lists have no place action",
  },
  shared_list_invite_sent: { missing: SHARE_RESULT },
  place_unstamped: { missing: PASSPORT },
  passport_opened: { missing: PASSPORT },
  passport_backfilled: { missing: PASSPORT },
  passport_stamp_landed: { missing: PASSPORT },
  passport_badge_unlocked: { missing: PASSPORT },
  passport_badge_shared: { missing: PASSPORT },
  passport_card_share_opened: { missing: PASSPORT },
  passport_story_share_opened: { missing: PASSPORT },
  passport_city_completed: { missing: PASSPORT },
  passport_city_stamp_changed: { missing: PASSPORT },
  passport_city_stamps_claimed: "sent",
  passport_city_stamps_opened: { missing: PASSPORT },
  passport_compare_opened: { missing: PASSPORT },
  passport_compare_resumed: { missing: PASSPORT },
  passport_compare_tapped: { missing: PASSPORT },
  passport_friend_places_saved: { missing: PASSPORT },
  passport_invite_opened: { missing: PASSPORT },
  passport_paywall_opened: { missing: PASSPORT },
  passport_shared: { missing: PASSPORT },
  passport_sharing_stopped: { missing: PASSPORT },
  paywall_requested: "sent",
  paywall_presentation_started: "sent",
  paywall_shown: "sent",
  paywall_cancelled: "sent",
  paywall_failed: "sent",
  paywall_purchase_completed: "sent",
  paywall_restored: "sent",
  paywall_blocked_action_resumed: "sent",
  entitlement_activated: "sent",
  trial_reminder_primer: "sent",
  trial_reminder_permission: "sent",
  review_prompted: { missing: "Swift never asks for an App Store review" },
  cancel_survey_shown: "sent",
  cancel_survey_dismissed: "sent",
  cancel_survey_submitted: "sent",
  next_up_shown: { missing: RETIRED },
  next_up_opened: { missing: RETIRED },
  next_up_dismissed: { missing: RETIRED },
  save_goal_reached: { missing: RETIRED },
  save_progress_card_shown: { missing: RETIRED },
  save_progress_card_action: { missing: RETIRED },
  save_recall_shown: { missing: RETIRED },
  save_recall_opened: { missing: RETIRED },
  save_recall_dismissed: { missing: RETIRED },
  space_created: { missing: RETIRED },
  space_updated: { missing: RETIRED },
  space_deleted: { missing: RETIRED },
  space_suggestions_accepted: { missing: RETIRED },
  suggestion_accepted: { missing: RETIRED },
  suggestion_dismissed: { missing: RETIRED },
};

const IOS = new URL("../../../ios/", import.meta.url);

function sources(folder: URL): string {
  return readdirSync(folder, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".swift") && !path.includes("Tests/"))
    .map((path) => readFileSync(new URL(path, folder), "utf8"))
    .join("\n");
}

const swift = sources(IOS);

it("sends from Swift every event the Expo app sends, unless the table says why not", () => {
  for (const [event, status] of Object.entries(SWIFT)) {
    expect(
      swift.includes(`"${event}"`),
      `${event} in apps/ios: ${JSON.stringify(status)}`,
    ).toBe(status === "sent");
  }
});

it("captures only events the Expo map types", () => {
  const captured = [...swift.matchAll(/Analytics\.capture\("([^"]+)"/g)]
    .map(([, event]) => event)
    .filter((event) => !event.startsWith("Application "));
  expect(captured.filter((event) => !(event in SWIFT))).toEqual([]);
});

it("keeps the Swift onboarding flow version and step ids", () => {
  const progress = readFileSync(
    new URL(
      "../../../ios/ShelvrKit/Sources/ShelvrKit/OnboardingProgress.swift",
      import.meta.url,
    ),
    "utf8",
  );
  expect(progress).toContain(`flowVersion = ${ONBOARDING_FLOW_VERSION}`);
  for (const [step, id] of Object.entries(ONBOARDING_STEP_IDS))
    expect(progress).toContain(`.${step}: "${id}"`);
});
