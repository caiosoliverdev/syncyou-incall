"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import EmojiPicker, { EmojiStyle, Theme, type EmojiClickData } from "emoji-picker-react";
import emojiDataPt from "emoji-picker-react/dist/data/emojis-pt.js";
import { LoaderCircle, Plus, X } from "lucide-react";
import { mergeStickerLibrary } from "@/lib/sticker-local-storage";
import type { StickerCaptionDrag } from "@/components/platform/sticker-compose-preview";
import { StickerComposePreview } from "@/components/platform/sticker-compose-preview";

const GIPHY_KEY =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_GIPHY_API_KEY
    ? process.env.NEXT_PUBLIC_GIPHY_API_KEY
    : "fryMJON1VF4CYVTukAHXTVnn1aZaeBmU";

type GiphyGifItem = {
  id: string;
  title?: string;
  images?: {
    fixed_height?: { url?: string };
    fixed_height_small?: { url?: string };
    downsized?: { url?: string };
  };
};

type MessageEmojiPickerProps = {
  isDark: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmojiSelect: (emoji: string) => void;
  /** Nova figurinha (upload); legenda opcional com posição sobre a imagem. */
  onSendSticker?: (file: File, meta?: StickerCaptionDrag | null) => void | Promise<void>;
  /** Reenviar figurinha já guardada (mesmo URL no servidor). */
  onResendSticker?: (url: string) => void | Promise<void>;
  /** Após escolher ficheiro: ex. remover fundo no servidor antes da pré-visualização. */
  prepareStickerImage?: (file: File) => Promise<File>;
  /** GIF (blob) a enviar como imagem. */
  onGifFile?: (file: File) => void | Promise<void>;
  /** Só conversas reais na API (não mock). */
  canSendMedia?: boolean;
  children: ReactNode;
};

type PanelTab = "emoji" | "stickers" | "gifs";

export function MessageEmojiPicker({
  isDark,
  open,
  onOpenChange,
  onEmojiSelect,
  onSendSticker,
  onResendSticker,
  prepareStickerImage,
  onGifFile,
  canSendMedia = true,
  children,
}: MessageEmojiPickerProps) {
  const [tab, setTab] = useState<PanelTab>("emoji");
  const [giphyQuery, setGiphyQuery] = useState("");
  const [giphyResults, setGiphyResults] = useState<GiphyGifItem[]>([]);
  const [giphyLoading, setGiphyLoading] = useState(false);
  const [giphyError, setGiphyError] = useState<string | null>(null);
  const [stickerBusy, setStickerBusy] = useState(false);
  const [gifBusyId, setGifBusyId] = useState<string | null>(null);
  const [stickerLibrary, setStickerLibrary] = useState<string[]>([]);
  const [stickerCompose, setStickerCompose] = useState<{ file: File; previewUrl: string } | null>(
    null,
  );
  const [stickerCaption, setStickerCaption] = useState("");
  const [stickerCaptionPos, setStickerCaptionPos] = useState({ xPercent: 50, yPercent: 18 });
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const giphyAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      setTab("emoji");
      setGiphyError(null);
    }
  }, [open]);

  useEffect(() => {
    if (open && tab === "stickers") {
      setStickerLibrary(mergeStickerLibrary());
    }
  }, [open, tab]);

  useEffect(() => {
    return () => {
      if (stickerCompose?.previewUrl) {
        URL.revokeObjectURL(stickerCompose.previewUrl);
      }
    };
  }, [stickerCompose]);

  const handleEmoji = (data: EmojiClickData) => {
    onEmojiSelect(data.emoji);
  };

  const openStickerCompose = (file: File) => {
    if (stickerCompose?.previewUrl) {
      URL.revokeObjectURL(stickerCompose.previewUrl);
    }
    const previewUrl = URL.createObjectURL(file);
    setStickerCaption("");
    setStickerCaptionPos({ xPercent: 50, yPercent: 18 });
    setStickerCompose({ file, previewUrl });
  };

  const closeStickerCompose = () => {
    if (stickerCompose?.previewUrl) {
      URL.revokeObjectURL(stickerCompose.previewUrl);
    }
    setStickerCompose(null);
    setStickerCaption("");
    setStickerCaptionPos({ xPercent: 50, yPercent: 18 });
  };

  const onStickerInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const t = file.type.toLowerCase();
    if (!t.startsWith("image/") || t === "image/svg+xml") return;
    void (async () => {
      setStickerBusy(true);
      try {
        let next = file;
        if (prepareStickerImage && canSendMedia) {
          try {
            next = await prepareStickerImage(file);
          } catch {
            next = file;
          }
        }
        openStickerCompose(next);
      } finally {
        setStickerBusy(false);
      }
    })();
  };

  const submitStickerCompose = async () => {
    if (!stickerCompose || !onSendSticker) return;
    setStickerBusy(true);
    try {
      const t = stickerCaption.trim();
      const meta: StickerCaptionDrag | null = t
        ? {
            text: t,
            xPercent: stickerCaptionPos.xPercent,
            yPercent: stickerCaptionPos.yPercent,
          }
        : null;
      await onSendSticker(stickerCompose.file, meta);
      closeStickerCompose();
      onOpenChange(false);
      setStickerLibrary(mergeStickerLibrary());
    } finally {
      setStickerBusy(false);
    }
  };

  const resendStickerFromLibrary = async (url: string) => {
    if (!onResendSticker || !canSendMedia) return;
    setStickerBusy(true);
    try {
      await onResendSticker(url);
      onOpenChange(false);
    } finally {
      setStickerBusy(false);
    }
  };

  const fetchGiphy = useCallback(async (q: string) => {
    const term = q.trim() || "happy";
    giphyAbortRef.current?.abort();
    const ac = new AbortController();
    giphyAbortRef.current = ac;
    setGiphyLoading(true);
    setGiphyError(null);
    try {
      const url = `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(GIPHY_KEY)}&q=${encodeURIComponent(term)}&limit=24&rating=g&lang=pt`;
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok) throw new Error("Giphy");
      const data = (await res.json()) as { data?: GiphyGifItem[] };
      setGiphyResults(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setGiphyError("Não foi possível carregar os GIFs.");
      setGiphyResults([]);
    } finally {
      setGiphyLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || tab !== "gifs") return;
    const t = window.setTimeout(() => {
      void fetchGiphy(giphyQuery);
    }, 320);
    return () => window.clearTimeout(t);
  }, [open, tab, giphyQuery, fetchGiphy]);

  const pickGif = async (item: GiphyGifItem) => {
    const raw =
      item.images?.fixed_height?.url ??
      item.images?.fixed_height_small?.url ??
      item.images?.downsized?.url;
    if (!raw || !onGifFile) return;
    setGifBusyId(item.id);
    try {
      const res = await fetch(raw);
      const blob = await res.blob();
      const name = `giphy-${item.id}.gif`;
      const file = new File([blob], name, { type: blob.type || "image/gif" });
      await onGifFile(file);
    } catch {
      setGiphyError("Não foi possível enviar este GIF.");
    } finally {
      setGifBusyId(null);
    }
  };

  const tabBtn = (id: PanelTab, label: string) => (
    <button
      type="button"
      key={id}
      onClick={() => setTab(id)}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
        tab === id
          ? isDark
            ? "bg-emerald-600/30 text-emerald-200"
            : "bg-emerald-100 text-emerald-800"
          : isDark
            ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
      }`}
    >
      {label}
    </button>
  );

  const panelClass = isDark
    ? "rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
    : "rounded-xl border border-zinc-200 bg-white shadow-2xl";

  const modalBg = isDark ? "border-zinc-600 bg-zinc-900 text-zinc-100" : "border-zinc-200 bg-white text-zinc-900";

  return (
    <>
      <Popover.Root open={open} onOpenChange={onOpenChange}>
        <Popover.Trigger asChild>{children}</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="start"
            sideOffset={32}
            collisionPadding={{ top: 16, bottom: 24, left: 12, right: 12 }}
            className="z-[200] w-[min(100vw-24px,360px)] rounded-xl border-0 bg-transparent p-0 shadow-none outline-none"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <div className={`flex flex-col overflow-hidden ${panelClass}`}>
              <div
                className={`flex flex-wrap gap-1 border-b px-2 py-2 ${
                  isDark ? "border-zinc-700 bg-zinc-900/80" : "border-zinc-200 bg-zinc-50/80"
                }`}
              >
                {tabBtn("emoji", "Emoji")}
                {tabBtn("stickers", "Figurinhas")}
                {tabBtn("gifs", "GIFs")}
              </div>

              {tab === "emoji" && (
                <div className="p-0">
                  <EmojiPicker
                    emojiData={emojiDataPt}
                    theme={isDark ? Theme.DARK : Theme.LIGHT}
                    emojiStyle={EmojiStyle.NATIVE}
                    width={Math.min(360, typeof window !== "undefined" ? window.innerWidth - 48 : 320)}
                    height={380}
                    searchPlaceholder="Buscar emoji"
                    searchClearButtonLabel="Limpar"
                    autoFocusSearch
                    previewConfig={{ showPreview: false }}
                    onEmojiClick={handleEmoji}
                  />
                </div>
              )}

              {tab === "stickers" && (
                <div className="relative flex min-h-[280px] flex-col gap-2 p-3 pt-12">
                  <input
                    ref={stickerInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
                    className="hidden"
                    onChange={onStickerInputChange}
                  />
                  <button
                    type="button"
                    disabled={!canSendMedia || stickerBusy}
                    onClick={() => stickerInputRef.current?.click()}
                    className={`absolute right-3 top-3 z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-dashed transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isDark
                        ? "border-zinc-500 bg-zinc-800/90 text-zinc-200 hover:bg-zinc-800"
                        : "border-zinc-300 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                    }`}
                    aria-label="Nova figurinha"
                  >
                    <Plus size={24} strokeWidth={2} />
                  </button>
                  <div className="grid grid-cols-4 gap-2">
                    {stickerLibrary.map((url) => (
                      <button
                        key={url}
                        type="button"
                        disabled={!canSendMedia || stickerBusy || !onResendSticker}
                        onClick={() => void resendStickerFromLibrary(url)}
                        className={`flex aspect-square items-center justify-center overflow-hidden rounded-lg border p-0 transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          isDark
                            ? "border-zinc-700 bg-zinc-800/80 hover:bg-zinc-800"
                            : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100"
                        }`}
                        title="Enviar figurinha"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                      </button>
                    ))}
                  </div>
                  {!canSendMedia && (
                    <p className={`text-xs ${isDark ? "text-amber-400/90" : "text-amber-700"}`}>
                      Abra uma conversa real para enviar figurinhas.
                    </p>
                  )}
                </div>
              )}

              {tab === "gifs" && (
                <div className="flex max-h-[420px] min-h-[280px] flex-col">
                  <div className="p-2 pb-0">
                    <input
                      type="search"
                      value={giphyQuery}
                      onChange={(e) => setGiphyQuery(e.target.value)}
                      placeholder="Pesquisar no Giphy…"
                      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                        isDark
                          ? "border-zinc-600 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
                          : "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400"
                      }`}
                    />
                  </div>
                  <div className="relative flex-1 overflow-y-auto p-2 pt-2">
                    {giphyLoading && (
                      <div className="flex justify-center py-8">
                        <LoaderCircle
                          className={`h-8 w-8 animate-spin ${isDark ? "text-zinc-500" : "text-zinc-400"}`}
                        />
                      </div>
                    )}
                    {giphyError && !giphyLoading && (
                      <p className={`px-2 text-center text-sm ${isDark ? "text-red-400" : "text-red-600"}`}>
                        {giphyError}
                      </p>
                    )}
                    {!giphyLoading && !giphyError && giphyResults.length === 0 && (
                      <p className={`px-2 text-center text-sm ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                        Nenhum resultado.
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-1.5">
                      {giphyResults.map((g) => {
                        const thumb =
                          g.images?.fixed_height_small?.url ??
                          g.images?.fixed_height?.url ??
                          g.images?.downsized?.url;
                        if (!thumb) return null;
                        return (
                          <button
                            key={g.id}
                            type="button"
                            disabled={!canSendMedia || gifBusyId !== null}
                            onClick={() => void pickGif(g)}
                            className="relative aspect-square overflow-hidden rounded-lg bg-zinc-800 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                            {gifBusyId === g.id && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                <LoaderCircle className="h-6 w-6 animate-spin text-white" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {!canSendMedia && (
                    <p className={`px-3 pb-3 text-xs ${isDark ? "text-amber-400/90" : "text-amber-700"}`}>
                      Abra uma conversa real para enviar GIFs.
                    </p>
                  )}
                </div>
              )}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {stickerCompose ? (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={() => !stickerBusy && closeStickerCompose()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sticker-compose-title"
            className={`w-full max-w-sm rounded-xl border p-4 shadow-2xl ${modalBg}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape" && !stickerBusy) closeStickerCompose();
            }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="sticker-compose-title" className="text-sm font-semibold">
                Enviar figurinha
              </h2>
              <button
                type="button"
                disabled={stickerBusy}
                onClick={() => closeStickerCompose()}
                className={`rounded-lg p-1 ${isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"}`}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mb-4">
              <StickerComposePreview
                previewUrl={stickerCompose.previewUrl}
                caption={stickerCaption}
                onCaptionChange={setStickerCaption}
                position={stickerCaptionPos}
                onPositionChange={(x, y) => setStickerCaptionPos({ xPercent: x, yPercent: y })}
                isDark={isDark}
              />
            </div>
            <button
              type="button"
              disabled={stickerBusy || !canSendMedia}
              onClick={() => void submitStickerCompose()}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                isDark ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-emerald-600 text-white hover:bg-emerald-500"
              }`}
            >
              {stickerBusy ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  A enviar…
                </>
              ) : (
                "Enviar figurinha"
              )}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
