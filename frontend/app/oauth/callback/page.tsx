"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { runOAuthCallbackFromSearchParams } from "@/lib/oauth-callback-flow";

export default function OAuthCallbackPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("A processar…");

  useEffect(() => {
    const run = async () => {
      const sp = new URLSearchParams(window.location.search);
      const result = await runOAuthCallbackFromSearchParams(sp);

      if (result.kind === "done") {
        setMsg("Sessão iniciada. A redirecionar…");
        router.replace("/");
        return;
      }

      setMsg(result.message);
    };
    void run();
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-950 p-6 text-center text-zinc-200">
      <p className="text-sm">{msg}</p>
    </div>
  );
}
