import GuidePage from "@/components/guides/GuidePage";
import { TRIP_FROM_REELS, guideMetadata } from "@/lib/guides";

export const metadata = guideMetadata(TRIP_FROM_REELS);

export default function PlanTripPage() {
  return <GuidePage page={TRIP_FROM_REELS} />;
}
