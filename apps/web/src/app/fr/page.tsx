import LocalizedLandingPage from "@/components/landing/LocalizedLandingPage";
import { FRENCH, landingMetadata } from "@/lib/localizedLanding";

export const metadata = landingMetadata(FRENCH);

export default function FrenchLanding() {
  return <LocalizedLandingPage page={FRENCH} />;
}
