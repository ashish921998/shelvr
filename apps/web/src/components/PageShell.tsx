import PageViewTracker from "@/components/PageViewTracker";

export default function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <PageViewTracker />
    </>
  );
}
