import { Wordmark } from "@shelvr/native-ui";

// Layout glue: the app's cream background. Sizes are the ones screens pass.
const surface = {
  display: "flex",
  alignItems: "center",
  padding: 16,
  borderRadius: 12,
  background: "var(--colors-background)",
};

/** Home's header title, at the default 24. */
export function Header() {
  return (
    <div style={surface}>
      <Wordmark />
    </div>
  );
}

/** The profile screen, at 30. */
export function Profile() {
  return (
    <div style={surface}>
      <Wordmark size={30} />
    </div>
  );
}

/** The onboarding promise screen, at 44. */
export function Onboarding() {
  return (
    <div style={surface}>
      <Wordmark size={44} />
    </div>
  );
}
