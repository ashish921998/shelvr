import Header from "@/components/Header";
import ItemDetails from "@/components/items/ItemDetails";
import type { Id } from "@packages/backend/convex/_generated/dataModel";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return (
    <main className="bg-[#FFF8F0] min-h-screen">
      <Header />
      <ItemDetails itemId={itemId as Id<"items">} />
    </main>
  );
}
