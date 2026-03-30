"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronUp, Video, VideoOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getPreferredCameraDeviceId,
  setPreferredCameraDeviceId,
} from "@/lib/call-camera-preference";

type CallCameraControlProps = {
  isDark: boolean;
  camOff: boolean;
  onToggleCamera: () => void;
  ctrlIdle: string;
  ctrlActive: string;
  size: "lg" | "sm";
  /** Chamado quando o utilizador escolhe outra câmera no menu (ex.: refrescar captura WebRTC). */
  onCameraDeviceChange?: () => void;
};

async function ensureVideoLabelsThenEnumerate(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    /* permissão negada ou sem dispositivo */
  }
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === "videoinput");
}

export function CallCameraControl({
  isDark,
  camOff,
  onToggleCamera,
  ctrlIdle,
  ctrlActive,
  size,
  onCameraDeviceChange,
}: CallCameraControlProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const deviceIdsSig = useMemo(() => devices.map((d) => d.deviceId).join("\0"), [devices]);

  const refreshDevices = useCallback(async () => {
    setLoading(true);
    try {
      const inputs = await ensureVideoLabelsThenEnumerate();
      setDevices(inputs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDevices();
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const onChange = () => void refreshDevices();
    md.addEventListener("devicechange", onChange);
    return () => md.removeEventListener("devicechange", onChange);
  }, [refreshDevices]);

  useEffect(() => {
    if (!devices.length) return;
    const stored = getPreferredCameraDeviceId();
    if (stored && devices.some((d) => d.deviceId === stored)) {
      setSelectedDeviceId(stored);
    } else {
      setSelectedDeviceId(null);
      if (stored) setPreferredCameraDeviceId(null);
    }
  }, [deviceIdsSig, devices.length]);

  const pickDevice = (deviceId: string | null) => {
    setSelectedDeviceId(deviceId);
    setPreferredCameraDeviceId(deviceId);
    setMenuOpen(false);
    onCameraDeviceChange?.();
  };

  const hMain = size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const hChevron = size === "lg" ? "h-12 w-8" : "h-10 w-7";
  const iconMain = size === "lg" ? 20 : 18;
  const iconChevron = size === "lg" ? 16 : 14;

  const groupClass = `inline-flex shrink-0 items-stretch overflow-hidden rounded-full transition ${
    camOff ? ctrlActive : ctrlIdle
  }`;

  const divider = isDark ? "border-white/15" : "border-slate-900/10";

  const contentClass = `z-[260] max-h-[min(20rem,calc(100vh-6rem))] min-w-[12rem] overflow-y-auto rounded-xl border py-1 shadow-2xl ${
    isDark ? "border-zinc-600 bg-zinc-900 text-zinc-100" : "border-zinc-200 bg-white text-zinc-900"
  }`;

  const itemClass = `flex cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm outline-none ${
    isDark ? "hover:bg-zinc-800" : "hover:bg-emerald-50/90"
  }`;

  return (
    <div className={groupClass}>
      <button
        type="button"
        aria-label={camOff ? "Ligar camera" : "Desligar camera"}
        aria-pressed={camOff}
        onClick={onToggleCamera}
        className={`flex shrink-0 items-center justify-center ${hMain}`}
      >
        {camOff ? <VideoOff size={iconMain} /> : <Video size={iconMain} />}
      </button>

      <DropdownMenu.Root
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open);
          if (open) void refreshDevices();
        }}
        modal={false}
      >
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label="Escolher camera"
            className={`flex shrink-0 items-center justify-center border-l ${divider} ${hChevron}`}
          >
            <ChevronUp size={iconChevron} aria-hidden />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="end"
            sideOffset={8}
            collisionPadding={8}
            className={contentClass}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <div
              className={`border-b px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide ${
                isDark ? "border-zinc-700 text-zinc-400" : "border-zinc-100 text-zinc-500"
              }`}
            >
              Câmera
            </div>
            <DropdownMenu.Item className={itemClass} onSelect={() => pickDevice(null)}>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">Padrão do sistema</span>
                <span className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>
                  Câmera predefinida do SO
                </span>
              </span>
              {selectedDeviceId === null ? (
                <Check size={16} className="shrink-0 text-emerald-500" aria-hidden />
              ) : (
                <span className="w-4 shrink-0" aria-hidden />
              )}
            </DropdownMenu.Item>
            {loading ? (
              <div
                className={`px-3 py-2 text-xs ${isDark ? "text-zinc-500" : "text-zinc-600"}`}
              >
                A carregar dispositivos…
              </div>
            ) : devices.length === 0 ? (
              <div
                className={`px-3 py-2 text-xs ${isDark ? "text-zinc-500" : "text-zinc-600"}`}
              >
                Nenhuma câmera encontrada. Verifique as permissões.
              </div>
            ) : (
              devices.map((d, index) => {
                const isSelected = selectedDeviceId === d.deviceId;
                const label = d.label?.trim() || `Câmera ${index + 1}`;
                return (
                  <DropdownMenu.Item
                    key={d.deviceId}
                    className={itemClass}
                    onSelect={() => pickDevice(d.deviceId)}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
                    {isSelected ? (
                      <Check size={16} className="shrink-0 text-emerald-500" aria-hidden />
                    ) : (
                      <span className="w-4 shrink-0" aria-hidden />
                    )}
                  </DropdownMenu.Item>
                );
              })
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
