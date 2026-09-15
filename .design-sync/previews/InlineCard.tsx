import { InlineCard } from "@shelvr/native-ui";

// Layout glue: the Home screen's background behind the card. InlineCard renders
// the frame, title, and body; the caller owns the actions. These buttons are the
// feedback invitation's own composition (feedback-invitation.tsx), written with
// the theme's CSS variables.
const screen = {
  paddingBlock: 12,
  borderRadius: 12,
  background: "var(--colors-background)",
};
const buttonRow = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 4,
};
const button = {
  minHeight: 44,
  padding: "0 16px",
  border: "none",
  borderRadius: 11,
  fontSize: 14,
  cursor: "pointer",
};
const primary = {
  ...button,
  background: "var(--colors-primary)",
  color: "var(--colors-primary-foreground)",
  fontFamily: "var(--fonts-bold)",
};
const secondary = {
  ...button,
  background: "transparent",
  color: "var(--colors-muted)",
  fontFamily: "var(--fonts-medium)",
};

// The cancel survey's stacked reason options (cancel-survey-card.tsx), with the
// reasons in CANCEL_SURVEY_REASONS order and their CANCEL_REASON_LABELS copy.
const options = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 8,
  marginTop: 4,
};
const option = {
  minHeight: 44,
  padding: "0 16px",
  border: "1px solid var(--colors-border)",
  borderRadius: 11,
  background: "transparent",
  textAlign: "left" as const,
  fontFamily: "var(--fonts-medium)",
  fontSize: 14,
  color: "var(--colors-foreground)",
  cursor: "pointer",
};
// Skip is a full-width row, as the card's column stretches it in the app.
const skip = secondary;

/** The one-time cancel survey on Home: four one-tap reasons and Skip. */
export function CancelSurvey() {
  return (
    <div style={screen}>
      <InlineCard
        testID="cancel-survey-card"
        title="What made you cancel?"
        body="Your trial is still active, but auto-renew is off. One tap helps us understand — it won’t change anything about your subscription."
      >
        <div style={options}>
          {[
            "Too expensive",
            "Not useful enough",
            "Missing a feature",
            "Something else",
          ].map((label) => (
            <button key={label} type="button" style={option}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" style={skip}>
          Skip
        </button>
      </InlineCard>
    </div>
  );
}

/** The feedback invitation on Home: title, body, and two actions. */
export function FeedbackInvitation() {
  return (
    <div style={screen}>
      <InlineCard
        testID="feedback-invitation"
        title="How’s Shelvr so far?"
        body="Tell us what’s working and what could be better."
      >
        <div style={buttonRow}>
          <button type="button" style={primary}>
            Send feedback
          </button>
          <button type="button" style={secondary}>
            Not now
          </button>
        </div>
      </InlineCard>
    </div>
  );
}
