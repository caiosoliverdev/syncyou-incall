import { Suspense } from "react";
import { CallScreen } from "./call-screen";

export default function CallPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen min-h-[400px] items-center justify-center bg-zinc-950 text-zinc-400">
          Carregando…
        </div>
      }
    >
      <CallScreen />
    </Suspense>
  );
}
