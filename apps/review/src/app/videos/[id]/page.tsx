import AuthGate from "@/components/AuthGate";
import VideoView from "@/components/VideoView";

export default async function VideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AuthGate>
      <VideoView videoId={id} />
    </AuthGate>
  );
}
