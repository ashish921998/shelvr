import GuidePage from "@/components/guides/GuidePage";
import { DATE_FROM_SAVES, guideMetadata } from "@/lib/guides";

export const metadata = guideMetadata(DATE_FROM_SAVES);

export default function PlanDatePage() {
  return <GuidePage page={DATE_FROM_SAVES} />;
}
