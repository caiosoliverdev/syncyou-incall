"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchLinkPreviewRequest } from "@/lib/api";

type PreviewJson = {
  url?: string;
  title?: string;
  siteName?: string;
  description?: string;
  images?: string[];
};

async function openExternal(url: string) {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function LinkPreviewAboveBubble({
  url,
  isDark,
  outgoing,
}: {
  url: string;
  isDark: boolean;
  outgoing: boolean;
}) {
  const [data, setData] = useState<PreviewJson | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    void fetchLinkPreviewRequest(url)
      .then((j) => {
        if (cancelled || !j || typeof j !== "object") {
          if (!cancelled) setData(null);
          return;
        }
        const title = typeof j.title === "string" && j.title.trim() ? j.title.trim() : null;
        if (!title) {
          if (!cancelled) setData(null);
          return;
        }
        setData({
          url: typeof j.url === "string" ? j.url : url,
          title,
          siteName: typeof j.siteName === "string" ? j.siteName : undefined,
          description: typeof j.description === "string" ? j.description : undefined,
          images: Array.isArray(j.images)
            ? j.images.filter((x): x is string => typeof x === "string" && x.length > 0)
            : [],
        });
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const border = outgoing
    ? isDark
      ? "border-emerald-700/60 bg-emerald-950/40"
      : "border-emerald-200 bg-emerald-50/90"
    : isDark
      ? "border-zinc-600 bg-zinc-900/80"
      : "border-zinc-200 bg-white";

  if (loading) {
    return (
      <div
        className={`w-full max-w-[min(280px,48cqw)] animate-pulse rounded-xl border px-3 py-2.5 ${border}`}
      >
        <div className={`h-3 w-3/4 rounded ${isDark ? "bg-zinc-700" : "bg-zinc-200"}`} />
        <div className={`mt-2 h-3 w-1/2 rounded ${isDark ? "bg-zinc-700" : "bg-zinc-200"}`} />
      </div>
    );
  }

  if (!data) return null;

  const href = data.url || url;
  const img = data.images?.[0];
  let host = "";
  try {
    host = new URL(href).hostname.replace(/^www\./, "");
  } catch {
    /* ignore */
  }

  return (
    <button
      type="button"
      onClick={() => void openExternal(href)}
      className={`w-full max-w-[min(280px,48cqw)] overflow-hidden rounded-xl border text-left shadow-sm transition hover:opacity-95 ${border}`}
    >
      {img ? (
        <div className="relative aspect-[1.85/1] w-full bg-black/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>
      ) : null}
      <div className="px-3 py-2">
        <p
          className={`line-clamp-2 text-sm font-semibold leading-snug ${
            isDark ? "text-zinc-100" : "text-zinc-900"
          }`}
        >
          {data.title}
        </p>
        {data.description ? (
          <p
            className={`mt-0.5 line-clamp-2 text-xs leading-snug ${
              isDark ? "text-zinc-400" : "text-zinc-600"
            }`}
          >
            {data.description}
          </p>
        ) : null}
        <div
          className={`mt-1.5 flex items-center gap-1 text-[11px] ${
            isDark ? "text-zinc-500" : "text-zinc-500"
          }`}
        >
          <ExternalLink size={12} className="shrink-0 opacity-80" aria-hidden />
          <span className="truncate">{data.siteName || host || href}</span>
        </div>
      </div>
    </button>
  );
}
