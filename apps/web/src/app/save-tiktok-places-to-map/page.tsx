import GuidePage from "@/components/guides/GuidePage";
import { TIKTOK_PLACES, guideMetadata } from "@/lib/guides";

export const metadata = guideMetadata(TIKTOK_PLACES);

export default function SaveTiktokPlacesPage() {
  return <GuidePage page={TIKTOK_PLACES} />;
}
