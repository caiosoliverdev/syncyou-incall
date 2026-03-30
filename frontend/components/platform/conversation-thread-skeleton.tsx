"use client";

type ConversationThreadSkeletonProps = {
  isDark: boolean;
  /** `chat`: mais linhas, avatares à esquerda — simula thread enquanto o scroll estabiliza. */
  variant?: "default" | "chat";
};

/** Placeholder enquanto o historico da conversa (API) carrega ou o scroll inicial estabiliza. */
export function ConversationThreadSkeleton({
  isDark,
  variant = "default",
}: ConversationThreadSkeletonProps) {
  const bar = isDark ? "bg-zinc-700/70" : "bg-zinc-200";
  const bubble = isDark ? "bg-zinc-800/90" : "bg-zinc-200/90";
  const avatar = isDark ? "bg-zinc-700/80" : "bg-zinc-300/90";
  const pulse = "animate-pulse";

  const row = (align: "start" | "end", wide: boolean) => (
    <div
      className={`flex w-full shrink-0 ${align === "end" ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`flex max-w-[min(100%,420px)] flex-col gap-2 rounded-2xl px-3 py-2.5 ${bubble} ${pulse}`}
      >
        <div
          className={`h-3 rounded ${bar} ${wide ? "w-[min(100%,280px)]" : "w-[min(100%,180px)]"}`}
        />
        <div className={`h-3 rounded ${bar} w-[min(100%,220px)]`} />
      </div>
    </div>
  );

  const chatRow = (incoming: boolean, wide: boolean, stagger: number) => (
    <div
      className={`flex w-full shrink-0 gap-2 ${incoming ? "justify-start" : "justify-end"}`}
      style={{ animationDelay: `${stagger}ms` }}
    >
      {incoming ? (
        <div
          className={`mt-0.5 h-9 w-9 shrink-0 rounded-full ${avatar} ${pulse}`}
          aria-hidden
        />
      ) : null}
      <div
        className={`flex max-w-[min(100%,420px)] flex-col gap-2 rounded-2xl px-3 py-2.5 ${bubble} ${pulse}`}
      >
        {incoming ? (
          <div className={`h-2.5 w-16 rounded ${bar}`} />
        ) : null}
        <div
          className={`h-3 rounded ${bar} ${wide ? "w-[min(100%,260px)]" : "w-[min(100%,160px)]"}`}
        />
        <div className={`h-3 rounded ${bar} w-[min(100%,200px)]`} />
      </div>
    </div>
  );

  const rows =
    variant === "chat" ? (
      <>
        {chatRow(true, true, 0)}
        {chatRow(false, false, 60)}
        {chatRow(true, false, 120)}
        {chatRow(true, true, 180)}
        {chatRow(false, true, 240)}
        {chatRow(true, false, 300)}
        {chatRow(false, false, 360)}
        {chatRow(true, true, 420)}
        {chatRow(false, true, 480)}
      </>
    ) : (
      <>
        {row("start", true)}
        {row("end", false)}
        {row("start", false)}
        {row("end", true)}
        {row("start", true)}
        {row("end", false)}
      </>
    );

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 ${
        isDark ? "bg-zinc-950" : "bg-zinc-50"
      }`}
      aria-busy="true"
      aria-label={variant === "chat" ? "A preparar conversa" : "A carregar mensagens"}
    >
      <div className="mx-auto mb-4 flex w-full max-w-[200px] flex-col items-center gap-2">
        <div className={`h-px w-full ${isDark ? "bg-zinc-800" : "bg-zinc-200"}`} />
        <div className={`h-3 w-24 rounded-full ${bar} ${pulse}`} />
        <div className={`h-px w-full ${isDark ? "bg-zinc-800" : "bg-zinc-200"}`} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-2.5 sm:gap-3">
        {rows}
      </div>
    </div>
  );
}
