"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle, MapPin, Smartphone } from "lucide-react";
import { emptyOtp6, Otp6Input } from "@/components/otp-6-input";
import type { AuthUser } from "@/lib/api";
import {
  ApiError,
  passwordChangeComplete,
  passwordChangeRequestOtp,
  passwordChangeVerifyOtp,
  twoFactorConfirmTotp,
  twoFactorDisable,
  twoFactorRequestOtp,
  twoFactorVerifyEmail,
} from "@/lib/api";

type SecuritySettingsPanelProps = {
  isDark: boolean;
  user: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
};

function getPasswordStrength(password: string): {
  score: number;
  label: string;
  widthClass: string;
  colorClass: string;
} {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  if (password.length >= 12) score += 1;
  if (score <= 1) {
    return { score, label: "Fraca", widthClass: "w-1/5", colorClass: "bg-red-500" };
  }
  if (score <= 3) {
    return { score, label: "Média", widthClass: "w-3/5", colorClass: "bg-yellow-500" };
  }
  if (score === 4) {
    return { score, label: "Boa", widthClass: "w-4/5", colorClass: "bg-lime-500" };
  }
  return { score, label: "Forte", widthClass: "w-full", colorClass: "bg-emerald-500" };
}

function inputClass(isDark: boolean) {
  return `w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition focus:ring-2 ${
    isDark
      ? "border-zinc-700 bg-zinc-900/80 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-600/50 focus:ring-emerald-600/30"
      : "border-emerald-200/90 bg-white text-emerald-950 placeholder:text-emerald-800/40 focus:border-emerald-400 focus:ring-emerald-400/35"
  }`;
}

export function SecuritySettingsPanel({
  isDark,
  user,
  onUserUpdated,
}: SecuritySettingsPanelProps) {
  const [pwStep, setPwStep] = useState<"idle" | "otp_sent" | "otp_ok">("idle");
  const [pwOtpDigits, setPwOtpDigits] = useState<string[]>(() => emptyOtp6());
  const [pwChangeToken, setPwChangeToken] = useState<string | null>(null);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const twoFactorOn = user.twoFactorEnabled ?? false;
  const [twoStep, setTwoStep] = useState<"idle" | "otp_sent" | "qr">("idle");
  const [twoOtpDigits, setTwoOtpDigits] = useState<string[]>(() => emptyOtp6());
  const [qrData, setQrData] = useState<{ qrDataUrl: string; manualSecret: string; otpauthUrl: string } | null>(
    null,
  );
  const [twoTotpDigits, setTwoTotpDigits] = useState<string[]>(() => emptyOtp6());
  const [twoLoading, setTwoLoading] = useState(false);
  const [twoError, setTwoError] = useState<string | null>(null);
  const [disablePw, setDisablePw] = useState("");

  const cardShell = isDark
    ? "rounded-2xl border border-zinc-800/90 bg-zinc-900/40 shadow-sm backdrop-blur-sm"
    : "rounded-2xl border border-emerald-100/90 bg-white shadow-sm shadow-emerald-950/5";

  const pwStrength = getPasswordStrength(newPw);

  const handleRequestPwOtp = async () => {
    if (!user.hasPassword) {
      setPwError("Conta sem senha local. Use recuperação de senha no início de sessão.");
      return;
    }
    setPwError(null);
    setPwLoading(true);
    try {
      await passwordChangeRequestOtp();
      setPwStep("otp_sent");
      setPwOtpDigits(emptyOtp6());
    } catch (e) {
      setPwError(e instanceof ApiError ? e.message : "Falha ao enviar código.");
    } finally {
      setPwLoading(false);
    }
  };

  const handleVerifyPwOtp = async () => {
    setPwError(null);
    setPwLoading(true);
    try {
      const { changeToken } = await passwordChangeVerifyOtp(pwOtpDigits.join(""));
      setPwChangeToken(changeToken);
      setPwStep("otp_ok");
      setNewPw("");
      setConfirmPw("");
    } catch (e) {
      setPwError(e instanceof ApiError ? e.message : "Código inválido.");
    } finally {
      setPwLoading(false);
    }
  };

  const handleCompletePw = async (e: FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (newPw !== confirmPw) {
      setPwError("As senhas não coincidem.");
      return;
    }
    if (!pwChangeToken) return;
    setPwLoading(true);
    try {
      await passwordChangeComplete(pwChangeToken, newPw, confirmPw);
      setPwStep("idle");
      setPwOtpDigits(emptyOtp6());
      setPwChangeToken(null);
      setNewPw("");
      setConfirmPw("");
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : "Falha ao guardar.");
    } finally {
      setPwLoading(false);
    }
  };

  const handleRequest2faOtp = async () => {
    setTwoError(null);
    setTwoLoading(true);
    try {
      await twoFactorRequestOtp();
      setTwoStep("otp_sent");
      setTwoOtpDigits(emptyOtp6());
    } catch (e) {
      setTwoError(e instanceof ApiError ? e.message : "Falha ao enviar código.");
    } finally {
      setTwoLoading(false);
    }
  };

  const handleVerify2faEmail = async () => {
    setTwoError(null);
    setTwoLoading(true);
    try {
      const data = await twoFactorVerifyEmail(twoOtpDigits.join(""));
      setQrData(data);
      setTwoStep("qr");
      setTwoTotpDigits(emptyOtp6());
    } catch (e) {
      setTwoError(e instanceof ApiError ? e.message : "Código inválido.");
    } finally {
      setTwoLoading(false);
    }
  };

  const handleConfirm2faTotp = async () => {
    setTwoError(null);
    setTwoLoading(true);
    try {
      const u = await twoFactorConfirmTotp(twoTotpDigits.join(""));
      onUserUpdated(u);
      setTwoStep("idle");
      setQrData(null);
      setTwoOtpDigits(emptyOtp6());
      setTwoTotpDigits(emptyOtp6());
    } catch (e) {
      setTwoError(e instanceof ApiError ? e.message : "Código inválido.");
    } finally {
      setTwoLoading(false);
    }
  };

  const handleDisable2fa = async () => {
    setTwoError(null);
    setTwoLoading(true);
    try {
      const u = await twoFactorDisable(user.hasPassword ? disablePw : undefined);
      onUserUpdated(u);
      setDisablePw("");
    } catch (e) {
      setTwoError(e instanceof ApiError ? e.message : "Falha ao desativar.");
    } finally {
      setTwoLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full min-w-0 space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className={cardShell}>
        <div
          className={`border-b px-5 py-4 ${isDark ? "border-zinc-800 bg-zinc-900/60" : "border-emerald-100 bg-emerald-50/50"}`}
        >
          <div className="flex items-center gap-2">
            <KeyRound className={`h-4 w-4 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
            <h3 className={`text-sm font-semibold ${isDark ? "text-zinc-100" : "text-emerald-950"}`}>
              Senha
            </h3>
          </div>
          <p className={`mt-1 text-xs leading-relaxed ${isDark ? "text-zinc-500" : "text-emerald-900/65"}`}>
            Altere a senha com verificação por código enviado ao email. Não é necessário indicar a senha atual.
          </p>
        </div>
        <div className="space-y-4 p-5">
          {pwStep === "idle" && (
            <button
              type="button"
              disabled={pwLoading || !user.hasPassword}
              onClick={() => void handleRequestPwOtp()}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {pwLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Editar senha"}
            </button>
          )}
          {pwStep === "otp_sent" && (
            <div className="space-y-3">
              <p className={`text-sm ${isDark ? "text-zinc-300" : "text-emerald-900/80"}`}>
                Introduza o código de 6 dígitos enviado para {user.email}.
              </p>
              <Otp6Input
                digits={pwOtpDigits}
                onDigitsChange={setPwOtpDigits}
                isDark={isDark}
                disabled={pwLoading}
                autoFocus
                groupAriaLabel="Código de verificação por email"
                className="flex flex-wrap justify-center gap-1.5 sm:justify-start sm:gap-2"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pwLoading || pwOtpDigits.join("").length !== 6}
                  onClick={() => void handleVerifyPwOtp()}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  Verificar código
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPwStep("idle");
                    setPwOtpDigits(emptyOtp6());
                    setPwError(null);
                  }}
                  className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
                    isDark ? "border-zinc-600 bg-zinc-800" : "border-emerald-200 bg-white"
                  }`}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {pwStep === "otp_ok" && (
            <form onSubmit={handleCompletePw} className="space-y-4">
              <div>
                <label className={`mb-1 block text-xs font-medium ${isDark ? "text-zinc-400" : "text-emerald-900/70"}`}>
                  Nova senha
                </label>
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className={inputClass(isDark)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <div>
                <label className={`mb-1 block text-xs font-medium ${isDark ? "text-zinc-400" : "text-emerald-900/70"}`}>
                  Confirmar senha
                </label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  className={inputClass(isDark)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className={isDark ? "text-zinc-400" : "text-emerald-800/70"}>Força da senha</span>
                  <span className="font-medium text-emerald-600">{pwStrength.label}</span>
                </div>
                <div className={`h-1.5 overflow-hidden rounded-full ${isDark ? "bg-zinc-700" : "bg-emerald-100"}`}>
                  <div
                    className={`h-full rounded-full transition-all ${pwStrength.colorClass} ${pwStrength.widthClass}`}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={pwLoading}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {pwLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Guardar nova senha"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPwStep("idle");
                    setPwChangeToken(null);
                    setPwError(null);
                  }}
                  className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
                    isDark ? "border-zinc-600 bg-zinc-800" : "border-emerald-200 bg-white"
                  }`}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
          {pwError && <p className="text-sm text-red-500">{pwError}</p>}
          {!user.hasPassword && (
            <p className={`text-sm ${isDark ? "text-zinc-500" : "text-emerald-800/70"}`}>
              Esta conta não tem senha local. Defina uma senha através de &quot;Esqueci a senha&quot; no início de sessão.
            </p>
          )}
        </div>
      </section>

      <section className={cardShell}>
        <div
          className={`border-b px-5 py-4 ${isDark ? "border-zinc-800 bg-zinc-900/60" : "border-emerald-100 bg-emerald-50/50"}`}
        >
          <div className="flex items-center gap-2">
            <Smartphone className={`h-4 w-4 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
            <h3 className={`text-sm font-semibold ${isDark ? "text-zinc-100" : "text-emerald-950"}`}>
              Autenticação de dois fatores (2FA)
            </h3>
          </div>
          <p className={`mt-1 text-xs leading-relaxed ${isDark ? "text-zinc-500" : "text-emerald-900/65"}`}>
            Com 2FA ativo, além da senha precisará de um código da app Google Authenticator ou compatível.
          </p>
        </div>
        <div className="space-y-4 p-5">
          {twoFactorOn ? (
            <div className="space-y-3">
              <p className={`text-sm font-medium ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                2FA está ativo. Para desativar, confirme a senha.
              </p>
              {user.hasPassword && (
                <input
                  type="password"
                  value={disablePw}
                  onChange={(e) => setDisablePw(e.target.value)}
                  className={inputClass(isDark)}
                  placeholder="Senha atual"
                  autoComplete="current-password"
                />
              )}
              <button
                type="button"
                disabled={twoLoading || (user.hasPassword && !disablePw.trim())}
                onClick={() => void handleDisable2fa()}
                className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                  isDark ? "border-red-800/80 bg-red-950/40 text-red-100" : "border-red-200 bg-red-50 text-red-900"
                }`}
              >
                {twoLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Desativar 2FA"}
              </button>
            </div>
          ) : twoStep === "idle" ? (
            <button
              type="button"
              disabled={twoLoading}
              onClick={() => void handleRequest2faOtp()}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {twoLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Ativar 2FA"}
            </button>
          ) : twoStep === "otp_sent" ? (
            <div className="space-y-3">
              <p className={`text-sm ${isDark ? "text-zinc-300" : "text-emerald-900/80"}`}>
                Código enviado para {user.email}.
              </p>
              <Otp6Input
                digits={twoOtpDigits}
                onDigitsChange={setTwoOtpDigits}
                isDark={isDark}
                disabled={twoLoading}
                autoFocus
                groupAriaLabel="Código de verificação 2FA por email"
                className="flex flex-wrap justify-center gap-1.5 sm:justify-start sm:gap-2"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={twoLoading || twoOtpDigits.join("").length !== 6}
                  onClick={() => void handleVerify2faEmail()}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  Verificar e mostrar QR
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTwoStep("idle");
                    setTwoOtpDigits(emptyOtp6());
                    setTwoError(null);
                  }}
                  className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
                    isDark ? "border-zinc-600 bg-zinc-800" : "border-emerald-200 bg-white"
                  }`}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            qrData && (
              <div className="space-y-4">
                <p className={`text-sm ${isDark ? "text-zinc-300" : "text-emerald-900/80"}`}>
                  1. Instale Google Authenticator (ou outra app TOTP). 2. Escaneie o QR ou introduza a chave manualmente.
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrData.qrDataUrl}
                  alt="QR"
                  className="mx-auto w-48 rounded-lg border border-zinc-600 bg-white p-2"
                />
                <p className={`break-all font-mono text-xs ${isDark ? "text-zinc-400" : "text-emerald-900/65"}`}>
                  Chave: {qrData.manualSecret}
                </p>
                <div>
                  <label className={`mb-1 block text-xs font-medium ${isDark ? "text-zinc-400" : "text-emerald-900/70"}`}>
                    Código de 6 dígitos da app
                  </label>
                  <Otp6Input
                    digits={twoTotpDigits}
                    onDigitsChange={setTwoTotpDigits}
                    isDark={isDark}
                    disabled={twoLoading}
                    autoFocus
                    groupAriaLabel="Código TOTP da aplicação autenticadora"
                    className="mt-1 flex flex-wrap justify-center gap-1.5 sm:justify-start sm:gap-2"
                  />
                </div>
                <button
                  type="button"
                  disabled={twoLoading || twoTotpDigits.join("").length !== 6}
                  onClick={() => void handleConfirm2faTotp()}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  Confirmar e ativar 2FA
                </button>
              </div>
            )
          )}
          {twoError && <p className="text-sm text-red-500">{twoError}</p>}
        </div>
      </section>

      <section className={cardShell}>
        <div
          className={`border-b px-5 py-4 ${isDark ? "border-zinc-800 bg-zinc-900/60" : "border-emerald-100 bg-emerald-50/50"}`}
        >
          <div className="flex items-center gap-2">
            <MapPin className={`h-4 w-4 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
            <h3 className={`text-sm font-semibold ${isDark ? "text-zinc-100" : "text-emerald-950"}`}>
              Sessão atual (referência)
            </h3>
          </div>
          <p className={`mt-1 text-xs leading-relaxed ${isDark ? "text-zinc-500" : "text-emerald-900/65"}`}>
            Localização e IP do último início de sessão registado no servidor.
          </p>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <div>
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${isDark ? "text-zinc-500" : "text-emerald-800/60"}`}>
              IP
            </p>
            <p className={`mt-1 font-mono text-sm ${isDark ? "text-zinc-200" : "text-emerald-950"}`}>
              {user.lastSessionIp ?? "—"}
            </p>
          </div>
          <div>
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${isDark ? "text-zinc-500" : "text-emerald-800/60"}`}>
              Cidade (estimada)
            </p>
            <p className={`mt-1 text-sm ${isDark ? "text-zinc-200" : "text-emerald-950"}`}>
              {user.lastSessionCity ?? "—"}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${isDark ? "text-zinc-500" : "text-emerald-800/60"}`}>
              Coordenadas
            </p>
            <p className={`mt-1 font-mono text-sm ${isDark ? "text-zinc-200" : "text-emerald-950"}`}>
              {user.lastSessionLatitude != null && user.lastSessionLongitude != null
                ? `${user.lastSessionLatitude.toFixed(5)}, ${user.lastSessionLongitude.toFixed(5)}`
                : "—"}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${isDark ? "text-zinc-500" : "text-emerald-800/60"}`}>
              Última atualização
            </p>
            <p className={`mt-1 text-sm ${isDark ? "text-zinc-200" : "text-emerald-950"}`}>
              {user.lastSessionAt ? new Date(user.lastSessionAt).toLocaleString("pt-PT") : "—"}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
