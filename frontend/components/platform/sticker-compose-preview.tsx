"use client";

import { useCallback, useRef } from "react";

export type StickerCaptionDrag = {
  text: string;
  /** Centro da legenda em % da área da imagem (0–100). */
  xPercent: number;
  yPercent: number;
};

type StickerComposePreviewProps = {
  previewUrl: string;
  caption: string;
  onCaptionChange: (value: string) => void;
  position: Pick<StickerCaptionDrag, "xPercent" | "yPercent">;
  onPositionChange: (x: number, y: number) => void;
  isDark: boolean;
};

/**
 * Pré-visualização da figurinha com legenda opcional arrastável sobre a imagem.
 */
export function StickerComposePreview({
  previewUrl,
  caption,
  onCaptionChange,
  position,
  onPositionChange,
  isDark,
}: StickerComposePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const clamp = useCallback((x: number, y: number) => {
    return {
      x: Math.max(4, Math.min(96, x)),
      y: Math.max(4, Math.min(96, y)),
    };
  }, []);

  const updateFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      const c = clamp(x, y);
      onPositionChange(c.x, c.y);
    },
    [clamp, onPositionChange],
  );

  const onPointerDownLabel = (e: React.PointerEvent) => {
    if (!caption.trim()) return;
    e.preventDefault();
    dragging.current = true;
    const move = (ev: PointerEvent) => {
      if (!dragging.current) return;
      updateFromClient(ev.clientX, ev.clientY);
    };
    const up = () => {
      dragging.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    updateFromClient(e.clientX, e.clientY);
  };

  const showLabel = caption.trim().length > 0;

  return (
    <div className="flex flex-col gap-2">
      <label className={`text-xs font-medium ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
        Legenda (opcional) — arraste sobre a imagem para posicionar
      </label>
      <textarea
        value={caption}
        onChange={(e) => onCaptionChange(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Escreva se quiser; pode ficar vazio."
        className={`w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none ${
          isDark
            ? "border-zinc-600 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
            : "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400"
        }`}
      />
      <div className="flex w-full justify-center">
        <div
          ref={containerRef}
          className={`relative inline-block max-h-56 max-w-full overflow-hidden rounded-lg border ${
            isDark ? "border-zinc-700 bg-zinc-950" : "border-zinc-200 bg-zinc-50"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt=""
            className="block max-h-56 w-auto max-w-full object-contain"
            draggable={false}
          />
        {showLabel ? (
          <span
            role="button"
            tabIndex={0}
            className={`absolute max-w-[90%] cursor-move select-none rounded px-1.5 py-0.5 text-center text-sm font-bold shadow-md ${
              isDark
                ? "bg-black/55 text-white ring-1 ring-white/30"
                : "bg-white/90 text-zinc-900 ring-1 ring-black/15"
            }`}
            style={{
              left: `${position.xPercent}%`,
              top: `${position.yPercent}%`,
              transform: "translate(-50%, -50%)",
            }}
            onPointerDown={onPointerDownLabel}
          >
            {caption.trim()}
          </span>
        ) : null}
        </div>
      </div>
    </div>
  );
}
