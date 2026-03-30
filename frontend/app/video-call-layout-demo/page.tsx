import { VideoCallDemo } from "@/components/platform/video-call-layout";

export default function VideoCallLayoutDemoPage() {
  return (
    <main className="min-h-screen bg-neutral-950 p-6 text-white">
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <h1 className="text-2xl font-semibold">Video Call Layout Demo</h1>
        <p className="text-sm text-neutral-300">
          Layout profissional com palco central, self-view fixo e sidebar dinâmica para
          compartilhamento de tela.
        </p>
        <VideoCallDemo />
      </div>
    </main>
  );
}
