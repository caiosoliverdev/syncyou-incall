"use client";

import type { ComponentType } from "react";
import { useEffect } from "react";
import { CircleAlert, CircleCheck, CircleX, Info, X } from "lucide-react";

export type NotificationType = "error" | "info" | "alerta" | "sucesso";
export type NotificationTheme = "dark" | "light";

export interface NotificationAlertProps {
  type: NotificationType;
  title: string;
  description?: string;
  visible?: boolean;
  durationMs?: number;
  theme?: NotificationTheme;
  inline?: boolean;
  onClose?: () => void;
  /** Botão secundário (ex.: Desfazer). */
  actionLabel?: string;
  onAction?: () => void;
}

const TYPE_STYLES: Record<NotificationType, { icon: ComponentType<{ size?: number }>; light: string; dark: string }> = {
  error: {
    icon: CircleX,
    light: "border-red-200 bg-red-50 text-red-900",
    dark: "border-red-500/40 bg-red-500/10 text-red-100",
  },
  info: {
    icon: Info,
    light: "border-blue-200 bg-blue-50 text-blue-900",
    dark: "border-blue-500/40 bg-blue-500/10 text-blue-100",
  },
  alerta: {
    icon: CircleAlert,
    light: "border-amber-200 bg-amber-50 text-amber-900",
    dark: "border-amber-500/40 bg-amber-500/10 text-amber-100",
  },
  sucesso: {
    icon: CircleCheck,
    light: "border-emerald-200 bg-emerald-50 text-emerald-900",
    dark: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
  },
};

export function NotificationAlert({
  type,
  title,
  description,
  visible = true,
  durationMs = 4200,
  theme = "light",
  inline = false,
  onClose,
  actionLabel,
  onAction,
}: NotificationAlertProps) {
  useEffect(() => {
    if (!visible || durationMs <= 0 || !onClose) return;
    const timer = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(timer);
  }, [visible, durationMs, onClose]);

  if (!visible) return null;

  const config = TYPE_STYLES[type];
  const Icon = config.icon;
  const palette = theme === "dark" ? config.dark : config.light;
  const actionBtn =
    theme === "dark"
      ? "border-emerald-500/50 bg-emerald-950/50 text-emerald-200 hover:bg-emerald-900/60"
      : "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100";

  const content = (
    <div
      className={`pointer-events-auto rounded-xl border p-4 shadow-2xl backdrop-blur-sm transition-all duration-300 ${palette}`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description ? <p className="mt-1 text-xs opacity-90">{description}</p> : null}
          {actionLabel && onAction ? (
            <button
              type="button"
              onClick={() => {
                onAction();
                onClose?.();
              }}
              className={`mt-1.5 cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${actionBtn}`}
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-md p-1 opacity-70 transition hover:opacity-100"
          aria-label="Fechar alerta"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );

  if (inline) return content;

  return <div className="pointer-events-none fixed top-4 right-4 z-[280] w-[360px] max-w-[calc(100vw-2rem)]">{content}</div>;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  description?: string;
  durationMs?: number;
}

interface NotificationAlertStackProps {
  items: NotificationItem[];
  theme?: NotificationTheme;
  onRemove: (id: string) => void;
}

export function NotificationAlertStack({ items, theme = "light", onRemove }: NotificationAlertStackProps) {
  return (
    <div className="pointer-events-none fixed top-4 right-4 z-[280] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-3">
      {items.map((item) => (
        <NotificationAlert
          key={item.id}
          type={item.type}
          title={item.title}
          description={item.description}
          durationMs={item.durationMs}
          theme={theme}
          inline
          onClose={() => onRemove(item.id)}
        />
      ))}
    </div>
  );
}
