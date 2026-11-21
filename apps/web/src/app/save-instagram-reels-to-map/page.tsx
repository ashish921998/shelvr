import GuidePage from "@/components/guides/GuidePage";
import { INSTAGRAM_REELS, guideMetadata } from "@/lib/guides";

export const metadata = guideMetadata(INSTAGRAM_REELS);

export default function SaveInstagramReelsPage() {
  return <GuidePage page={INSTAGRAM_REELS} />;
}
