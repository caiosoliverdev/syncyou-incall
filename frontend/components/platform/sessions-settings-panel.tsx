"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, MonitorSmartphone } from "lucide-react";
import { ApiError, listSessionsRequest, revokeSessionRequest, type SessionListItem } from "@/lib/api";

type SessionsSettingsPanelProps = {
  isDark: boolean;
  /** Chamado quando a sessão actual é revogada ou o servidor força fim de sessão. */
  onLogout: () => void | Promise<void>;
};

function formatLoginMethod(method: string): string {
  const m: Record<string, string> = {
    password: "Palavra-passe",
    totp_2fa: "2FA (TOTP)",
    oauth_google: "Conta externa (legado)",
    oauth_microsoft: "Conta externa (legado)",
    oauth_reactivate: "Reativação (legado)",
    oauth_register: "Registo (legado)",
  };
  return m[method] ?? method;
}

function shortUserAgent(ua: string | null): string {
  if (!ua) return "—";
  if (ua.length <= 72) return ua;
  return `${ua.slice(0, 69)}…`;
}

export function SessionsSettingsPanel({ isDark, onLogout }: SessionsSettingsPanelProps) {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await listSessionsRequest();
      setSessions(data.sessions);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível carregar as sessões.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRevoke = async (row: SessionListItem) => {
    if (revokingId) return;
    setRevokingId(row.id);
    setError(null);
    try {
      const { wasCurrent } = await revokeSessionRequest(row.id);
      if (wasCurrent) {
        await onLogout();
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível desligar a sessão.");
    } finally {
      setRevokingId(null);
    }
  };

  const cardShell = isDark
    ? "rounded-2xl border border-zinc-800/90 bg-zinc-900/40 shadow-sm backdrop-blur-sm"
    : "rounded-2xl border border-emerald-100/90 bg-white shadow-sm shadow-emerald-950/5";

  const muted = isDark ? "text-zinc-500" : "text-emerald-900/65";
  const label = isDark ? "text-zinc-400" : "text-emerald-800/70";
  const text = isDark ? "text-zinc-200" : "text-emerald-950";

  return (
    <div className="space-y-6 px-5 py-6 sm:px-8 sm:py-8">
      {error && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <section className={cardShell}>
        <div
          className={`border-b px-5 py-4 ${isDark ? "border-zinc-800 bg-zinc-900/60" : "border-emerald-100 bg-emerald-50/50"}`}
        >
          <div className="flex items-center gap-2">
            <MonitorSmartphone className={`h-4 w-4 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
            <h3 className={`text-sm font-semibold ${isDark ? "text-zinc-100" : "text-emerald-950"}`}>
              Sessões em linha
            </h3>
          </div>
          <p className={`mt-1 text-xs leading-relaxed ${muted}`}>
            Só aparecem dispositivos ou separadores com ligação activa ao serviço (Socket.IO). Ao desligar uma sessão, esse
            dispositivo termina a sessão sozinho. A marca <span className="font-medium">Sessão actual</span> indica o
            separador onde está agora.
          </p>
        </div>
        <div className="p-5">
          {loading ? (
            <div className={`flex items-center gap-2 py-8 text-sm ${muted}`}>
              <LoaderCircle className="h-5 w-5 animate-spin" />
              A carregar…
            </div>
          ) : sessions.length === 0 ? (
            <p className={`text-sm ${muted}`}>
              Nenhuma sessão em linha. Se acabou de iniciar sessão, aguarde alguns segundos ou confirme que o access token
              inclui sessão (volte a iniciar sessão após actualização do servidor).
            </p>
          ) : (
            <ul className="divide-y divide-zinc-200/80 dark:divide-zinc-800">
              {sessions.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-mono text-sm ${text}`}>{row.ip}</span>
                      {row.current && (
                        <span className="rounded-md bg-emerald-600/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                          Sessão actual
                        </span>
                      )}
                      <span className="rounded-md bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
                        Em linha
                      </span>
                      {!row.active && (
                        <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-500">
                          Refresh expirado
                        </span>
                      )}
                    </div>
                    <p className={`text-xs ${label}`}>
                      {formatLoginMethod(row.loginMethod)}
                      {row.city ? ` · ${row.city}` : ""}
                    </p>
                    <p className={`text-[11px] ${muted}`} title={row.userAgent ?? undefined}>
                      {shortUserAgent(row.userAgent)}
                    </p>
                    <p className={`text-[11px] ${muted}`}>
                      Início: {new Date(row.createdAt).toLocaleString("pt-PT")} · Expira:{" "}
                      {new Date(row.expiresAt).toLocaleString("pt-PT")}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={revokingId !== null}
                    onClick={() => void handleRevoke(row)}
                    className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                      row.current
                        ? isDark
                          ? "border border-red-500/50 bg-red-600/20 text-red-400 hover:bg-red-600/30"
                          : "border border-red-200 bg-red-50 text-red-800 hover:bg-red-100"
                        : isDark
                          ? "border border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                          : "border border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50"
                    }`}
                  >
                    {revokingId === row.id ? (
                      <span className="inline-flex items-center gap-2">
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        A desligar…
                      </span>
                    ) : row.current ? (
                      "Terminar sessão"
                    ) : (
                      "Desligar"
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
