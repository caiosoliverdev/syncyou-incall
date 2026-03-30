"use client";

import { X } from "lucide-react";
import Cropper, { type Area } from "react-easy-crop";

type PhotoCropModalProps = {
  isDark: boolean;
  imageSrc: string;
  crop: { x: number; y: number };
  zoom: number;
  onCropChange: (crop: { x: number; y: number }) => void;
  onZoomChange: (zoom: number) => void;
  onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void;
  onClose: () => void;
  onCancel: () => void;
  onApply: () => void;
  applyDisabled?: boolean;
  applyLabel?: string;
  /** Título da janela (por defeito: foto de perfil). */
  title?: string;
  /** Classe do overlay (ex. `z-[430]` para ficar acima de outro modal). */
  overlayClassName?: string;
  /** Sufixo para ids de controlos (ex.: `-reg`, `-app`) */
  idSuffix?: string;
};

export function PhotoCropModal({
  isDark,
  imageSrc,
  crop,
  zoom,
  onCropChange,
  onZoomChange,
  onCropComplete,
  onClose,
  onCancel,
  onApply,
  applyDisabled = false,
  applyLabel = "Aplicar",
  title = "Ajustar foto de perfil",
  overlayClassName = "z-[230]",
  idSuffix = "",
}: PhotoCropModalProps) {
  const zid = `zoom-range${idSuffix}`;

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black/60 p-4 ${overlayClassName}`}
    >
      <div
        className={`w-full max-w-xl rounded-xl border shadow-xl ${
          isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "border-emerald-300 bg-white text-emerald-950"
        }`}
      >
        <div
          className={`flex items-center justify-between border-b px-4 py-3 ${isDark ? "border-zinc-700" : "border-emerald-200"}`}
        >
          <h3 className="text-sm font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md p-1 hover:bg-zinc-200/20"
            aria-label="Fechar cortador"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4">
          <div className="relative h-72 w-full overflow-hidden rounded-lg bg-black">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={onCropChange}
              onZoomChange={onZoomChange}
              onCropComplete={onCropComplete}
            />
          </div>

          <div className="mt-4 space-y-2">
            <label htmlFor={zid} className="text-xs font-medium">
              Zoom
            </label>
            <input
              id={zid}
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(event) => onZoomChange(Number(event.target.value))}
              className="w-full cursor-pointer accent-emerald-600"
            />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onCancel}
              className={`w-full cursor-pointer rounded-md border px-3 py-2.5 text-sm font-semibold transition ${
                isDark
                  ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700"
                  : "border-emerald-300 bg-emerald-100 hover:bg-emerald-200"
              }`}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={applyDisabled}
              onClick={() => void onApply()}
              className="w-full cursor-pointer rounded-md bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {applyLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
