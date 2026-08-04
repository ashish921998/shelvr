import Header from "@/components/Header";
import ItemsFeed from "@/components/items/ItemsFeed";

export default function AppHomePage() {
  return (
    <main className="bg-[#FFF8F0] min-h-screen">
      <Header />
      <ItemsFeed />
    </main>
  );
}
