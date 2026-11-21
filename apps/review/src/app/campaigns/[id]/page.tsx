import AuthGate from "@/components/AuthGate";
import CampaignView from "@/components/CampaignView";

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AuthGate>
      <CampaignView campaignId={id} />
    </AuthGate>
  );
}
