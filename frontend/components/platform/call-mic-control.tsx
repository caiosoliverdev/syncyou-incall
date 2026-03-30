"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronUp, Mic, MicOff } from "lucide-react";
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyPreferredSinkToAudioElement,
  audioElementSupportsSetSinkId,
  getPreferredAudioOutputDeviceId,
  setPreferredAudioOutputDeviceId,
} from "@/lib/call-audio-output-preference";
import {
  getPreferredMicDeviceId,
  setPreferredMicDeviceId,
} from "@/lib/call-microphone-preference";

type CallMicControlProps = {
  isDark: boolean;
  micMuted: boolean;
  onToggleMute: () => void;
  ctrlIdle: string;
  ctrlActive: string;
  /** Controles grandes no overlay completo ou compactos na barra minimizada. */
  size: "lg" | "sm";
  /** Áudio remoto da chamada — para `setSinkId` (fone vs altifalante). */
  remoteAudioRef?: RefObject<HTMLAudioElement | null>;
  /** Chamado após escolher outro microfone (ex.: refrescar WebRTC). */
  onMicDeviceChange?: () => void;
};

async function ensureMicLabelsThenEnumerate(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    /* permissão negada ou sem dispositivo — ainda listamos o que der */
  }
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === "audioinput");
}

async function enumerateAudioOutputs(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === "audiooutput");
}

export function CallMicControl({
  isDark,
  micMuted,
  onToggleMute,
  ctrlIdle,
  ctrlActive,
  size,
  remoteAudioRef,
  onMicDeviceChange,
}: CallMicControlProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const [sinkSupported, setSinkSupported] = useState(false);

  const deviceIdsSig = useMemo(() => devices.map((d) => d.deviceId).join("\0"), [devices]);
  const outputIdsSig = useMemo(() => outputDevices.map((d) => d.deviceId).join("\0"), [outputDevices]);

  const refreshDevices = useCallback(async () => {
    setLoading(true);
    try {
      const [inputs, outputs] = await Promise.all([
        ensureMicLabelsThenEnumerate(),
        enumerateAudioOutputs(),
      ]);
      setDevices(inputs);
      setOutputDevices(outputs);
      if (typeof document !== "undefined") {
        const probe = document.createElement("audio");
        setSinkSupported(audioElementSupportsSetSinkId(probe));
      }
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
    const stored = getPreferredMicDeviceId();
    if (stored && devices.some((d) => d.deviceId === stored)) {
      setSelectedDeviceId(stored);
    } else {
      setSelectedDeviceId(null);
      if (stored) setPreferredMicDeviceId(null);
    }
  }, [deviceIdsSig, devices.length]);

  useEffect(() => {
    if (!outputDevices.length) return;
    const stored = getPreferredAudioOutputDeviceId();
    if (stored && outputDevices.some((d) => d.deviceId === stored)) {
      setSelectedOutputId(stored);
    } else {
      setSelectedOutputId(null);
      if (stored) setPreferredAudioOutputDeviceId(null);
    }
  }, [outputIdsSig, outputDevices.length]);

  const pickMicDevice = (deviceId: string | null) => {
    setSelectedDeviceId(deviceId);
    setPreferredMicDeviceId(deviceId);
    onMicDeviceChange?.();
    setMenuOpen(false);
  };

  const pickOutputDevice = async (deviceId: string | null) => {
    setSelectedOutputId(deviceId);
    setPreferredAudioOutputDeviceId(deviceId);
    const el = remoteAudioRef?.current;
    if (el) await applyPreferredSinkToAudioElement(el);
    setMenuOpen(false);
  };

  const hMain = size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const hChevron = size === "lg" ? "h-12 w-8" : "h-10 w-7";
  const iconMain = size === "lg" ? 20 : 18;
  const iconChevron = size === "lg" ? 16 : 14;

  const groupClass = `inline-flex shrink-0 items-stretch overflow-hidden rounded-full transition ${
    micMuted ? ctrlActive : ctrlIdle
  }`;

  const divider = isDark ? "border-white/15" : "border-slate-900/10";

  const contentClass = `z-[260] max-h-[min(20rem,calc(100vh-6rem))] min-w-[13rem] max-w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border py-1 shadow-2xl ${
    isDark ? "border-zinc-600 bg-zinc-900 text-zinc-100" : "border-zinc-200 bg-white text-zinc-900"
  }`;

  const itemClass = `flex cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm outline-none ${
    isDark ? "hover:bg-zinc-800" : "hover:bg-emerald-50/90"
  }`;

  return (
    <div className={groupClass}>
      <button
        type="button"
        aria-label={micMuted ? "Ativar microfone" : "Silenciar microfone"}
        aria-pressed={micMuted}
        onClick={onToggleMute}
        className={`flex shrink-0 items-center justify-center ${hMain}`}
      >
        {micMuted ? <MicOff size={iconMain} /> : <Mic size={iconMain} />}
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
            aria-label="Microfone e saída de áudio"
            className={`flex shrink-0 items-center justify-center border-l ${divider} ${hChevron} ${
              micMuted ? "" : ""
            }`}
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
              Microfone
            </div>
            <DropdownMenu.Item className={itemClass} onSelect={() => pickMicDevice(null)}>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">Padrão do sistema</span>
                <span className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>
                  Microfone predefinido do SO
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
                Nenhum microfone encontrado. Verifique as permissões.
              </div>
            ) : (
              devices.map((d, index) => {
                const isSelected = selectedDeviceId === d.deviceId;
                const label = d.label?.trim() || `Microfone ${index + 1}`;
                return (
                  <DropdownMenu.Item
                    key={d.deviceId}
                    className={itemClass}
                    onSelect={() => pickMicDevice(d.deviceId)}
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

            <div
              className={`mt-1 border-t px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide ${
                isDark ? "border-zinc-700 text-zinc-400" : "border-zinc-100 text-zinc-500"
              }`}
            >
              Saída de áudio
            </div>
            {!sinkSupported ? (
              <div
                className={`px-3 py-2 text-xs ${isDark ? "text-zinc-500" : "text-zinc-600"}`}
              >
                Este navegador não permite escolher a saída (setSinkId). Use o misturador do
                sistema ou Chrome/Edge actualizado.
              </div>
            ) : loading ? null : outputDevices.length === 0 ? (
              <div
                className={`px-3 py-2 text-xs ${isDark ? "text-zinc-500" : "text-zinc-600"}`}
              >
                Nenhuma saída listada.
              </div>
            ) : (
              <>
                <DropdownMenu.Item className={itemClass} onSelect={() => pickOutputDevice(null)}>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-medium">Padrão do sistema</span>
                    <span className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>
                      Altifalante / saída predefinida
                    </span>
                  </span>
                  {selectedOutputId === null ? (
                    <Check size={16} className="shrink-0 text-emerald-500" aria-hidden />
                  ) : (
                    <span className="w-4 shrink-0" aria-hidden />
                  )}
                </DropdownMenu.Item>
                {outputDevices.map((d, index) => {
                  const isSelected = selectedOutputId === d.deviceId;
                  const label = d.label?.trim() || `Saída ${index + 1}`;
                  return (
                    <DropdownMenu.Item
                      key={d.deviceId}
                      className={itemClass}
                      onSelect={() => pickOutputDevice(d.deviceId)}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
                      {isSelected ? (
                        <Check size={16} className="shrink-0 text-emerald-500" aria-hidden />
                      ) : (
                        <span className="w-4 shrink-0" aria-hidden />
                      )}
                    </DropdownMenu.Item>
                  );
                })}
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
