import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Chamada · SyncYou",
  description: "Janela de chamada de voz e video",
};

export default function CallLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen min-h-[100dvh]">
      {children}
    </div>
  );
}
