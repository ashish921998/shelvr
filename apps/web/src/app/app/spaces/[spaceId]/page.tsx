import Header from "@/components/Header";
import SpaceDetails from "@/components/spaces/SpaceDetails";
import type { Id } from "@packages/backend/convex/_generated/dataModel";

export default async function SpacePage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;
  return (
    <main className="bg-[#FFF8F0] min-h-screen">
      <Header />
      <SpaceDetails spaceId={spaceId as Id<"spaces">} />
    </main>
  );
}
