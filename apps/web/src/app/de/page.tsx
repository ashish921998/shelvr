import LocalizedLandingPage from "@/components/landing/LocalizedLandingPage";
import { GERMAN, landingMetadata } from "@/lib/localizedLanding";

export const metadata = landingMetadata(GERMAN);

export default function GermanLanding() {
  return <LocalizedLandingPage page={GERMAN} />;
}
