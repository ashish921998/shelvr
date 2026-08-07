import { posthog } from '@/lib/posthog';

export type AnalyticsEventProperties = {
  article_saved: Record<string, never>;
  note_saved: Record<string, never>;
  images_saved: { image_count: number };
  photo_captured: { capture_mode: 'photo' | 'sticker' };
  item_space_membership_changed: { membership_added: boolean };
  item_shared: Record<string, never>;
  item_link_copied: Record<string, never>;
  item_deleted: Record<string, never>;
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
  shared_content_saved: { item_count: number };
};

export type AnalyticsEvent = keyof AnalyticsEventProperties;

function capture<Event extends AnalyticsEvent>(
  event: Event,
  properties?: AnalyticsEventProperties[Event],
): void {
  if (!posthog) return;

  try {
    if (properties === undefined) {
      posthog.capture(event);
    } else {
      posthog.capture(event, properties);
    }
  } catch {
    // Analytics must never change the outcome of a product action.
  }
}

function identify(userId: string, email?: string): void {
  if (!posthog) return;

  try {
    posthog.identify(userId, email ? { $set: { email } } : undefined);
  } catch {
    // Analytics must never block authentication or app rendering.
  }
}

function reset(): void {
  if (!posthog) return;

  try {
    posthog.reset();
  } catch {
    // Analytics must never block sign-out.
  }
}

export const analytics = {
  capture,
  identify,
  reset,
} satisfies {
  capture: typeof capture;
  identify: typeof identify;
  reset: typeof reset;
};
