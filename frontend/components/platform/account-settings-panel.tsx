"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  Camera,
  LoaderCircle,
  Mail,
  Phone,
  ShieldAlert,
  Trash2,
  UserRound,
  Globe,
} from "lucide-react";
import {
  FaDiscord,
  FaFacebook,
  FaInstagram,
  FaLinkedin,
  FaYoutube,
} from "react-icons/fa6";
import type { AuthUser } from "@/lib/api";
import {
  ApiError,
  deactivateAccountRequest,
  deleteAccountRequest,
  updateProfileRequest,
} from "@/lib/api";
import { bustAvatarCache } from "@/lib/avatar-url";

type AccountSettingsPanelProps = {
  isDark: boolean;
  user: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
  onAvatarFileChosen: (file: File) => void;
  avatarUploading: boolean;
  onAfterDeactivate: () => void;
  onAfterDelete: () => void;
};

function FieldLabel({
  children,
  isDark,
}: {
  children: ReactNode;
  isDark: boolean;
}) {
  return (
    <label
      className={`mb-1.5 block text-xs font-medium uppercase tracking-wide ${
        isDark ? "text-zinc-400" : "text-emerald-900/70"
      }`}
    >
      {children}
    </label>
  );
}

function inputClass(isDark: boolean) {
  return `w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition focus:ring-2 ${
    isDark
      ? "border-zinc-700 bg-zinc-900/80 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-600/50 focus:ring-emerald-600/30"
      : "border-emerald-200/90 bg-white text-emerald-950 placeholder:text-emerald-800/40 focus:border-emerald-400 focus:ring-emerald-400/35"
  }`;
}

export function AccountSettingsPanel({
  isDark,
  user,
  onUserUpdated,
  onAvatarFileChosen,
  avatarUploading,
  onAfterDeactivate,
  onAfterDelete,
}: AccountSettingsPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [phoneWhatsapp, setPhoneWhatsapp] = useState(user.phoneWhatsapp ?? "");
  const [socialDiscord, setSocialDiscord] = useState(user.socialDiscord ?? "");
  const [socialLinkedin, setSocialLinkedin] = useState(user.socialLinkedin ?? "");
  const [socialYoutube, setSocialYoutube] = useState(user.socialYoutube ?? "");
  const [socialInstagram, setSocialInstagram] = useState(user.socialInstagram ?? "");
  const [socialFacebook, setSocialFacebook] = useState(user.socialFacebook ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(user.websiteUrl ?? "");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  /** 1.º passo: confirmação explícita */
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  /** 2.º passo: senha / EXCLUIR */
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deactivatePassword, setDeactivatePassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [dangerLoading, setDangerLoading] = useState(false);
  const [dangerError, setDangerError] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(user.firstName);
    setLastName(user.lastName);
    setPhoneWhatsapp(user.phoneWhatsapp ?? "");
    setSocialDiscord(user.socialDiscord ?? "");
    setSocialLinkedin(user.socialLinkedin ?? "");
    setSocialYoutube(user.socialYoutube ?? "");
    setSocialInstagram(user.socialInstagram ?? "");
    setSocialFacebook(user.socialFacebook ?? "");
    setWebsiteUrl(user.websiteUrl ?? "");
  }, [user]);

  const hasPassword = user.hasPassword ?? false;

  const anyDangerDialogOpen =
    showDeactivateConfirm ||
    showDeactivate ||
    showDeleteConfirm ||
    showDelete;

  useEffect(() => {
    if (!anyDangerDialogOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowDeactivateConfirm(false);
        setShowDeactivate(false);
        setShowDeleteConfirm(false);
        setShowDelete(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyDangerDialogOpen]);

  const initials = `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase().slice(0, 2) || "?";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaveError(null);
    setSaveOk(false);
    setSaving(true);
    try {
      const updated = await updateProfileRequest({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneWhatsapp: phoneWhatsapp.trim(),
        socialDiscord: socialDiscord.trim(),
        socialLinkedin: socialLinkedin.trim(),
        socialYoutube: socialYoutube.trim(),
        socialInstagram: socialInstagram.trim(),
        socialFacebook: socialFacebook.trim(),
        websiteUrl: websiteUrl.trim(),
      });
      onUserUpdated({
        ...updated,
        avatarUrl: bustAvatarCache(updated.avatarUrl),
      });
      setSaveOk(true);
      window.setTimeout(() => setSaveOk(false), 2800);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Não foi possível guardar.");
    } finally {
      setSaving(false);
    }
  };

  const cardShell = isDark
    ? "rounded-2xl border border-zinc-800/90 bg-zinc-900/40 shadow-sm backdrop-blur-sm"
    : "rounded-2xl border border-emerald-100/90 bg-white shadow-sm shadow-emerald-950/5";

  const handleDeactivate = async () => {
    setDangerError(null);
    setDangerLoading(true);
    try {
      await deactivateAccountRequest(hasPassword ? deactivatePassword : undefined);
      setShowDeactivate(false);
      onAfterDeactivate();
    } catch (err) {
      setDangerError(err instanceof ApiError ? err.message : "Falha ao desativar.");
    } finally {
      setDangerLoading(false);
    }
  };

  const handleDelete = async () => {
    setDangerError(null);
    if (deleteConfirm !== "EXCLUIR") {
      setDangerError('Digite EXCLUIR para confirmar.');
      return;
    }
    setDangerLoading(true);
    try {
      await deleteAccountRequest("EXCLUIR", hasPassword ? deletePassword : undefined);
      setShowDelete(false);
      onAfterDelete();
    } catch (err) {
      setDangerError(err instanceof ApiError ? err.message : "Falha ao eliminar conta.");
    } finally {
      setDangerLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full min-w-0 space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAvatarFileChosen(f);
          e.target.value = "";
        }}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2 2xl:items-stretch">
        {/* Perfil */}
        <section className={`${cardShell} flex h-full min-h-0 flex-col overflow-hidden`}>
          <div
            className={`border-b px-5 py-4 ${isDark ? "border-zinc-800 bg-zinc-900/60" : "border-emerald-100 bg-emerald-50/50"}`}
          >
            <h3 className={`text-sm font-semibold ${isDark ? "text-zinc-100" : "text-emerald-950"}`}>
              Identidade e foto
            </h3>
            <p className={`mt-1 text-xs leading-relaxed ${isDark ? "text-zinc-500" : "text-emerald-900/65"}`}>
              Estes dados identificam-no na SyncYou. A foto e os contactos podem ser alterados a qualquer momento
              após iniciar sessão.
            </p>
          </div>
          <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-start">
            <div className="relative shrink-0">
              <div
                className={`relative h-24 w-24 overflow-hidden rounded-2xl ring-2 ring-offset-2 ${
                  isDark ? "ring-emerald-500/35 ring-offset-zinc-900" : "ring-emerald-400/35 ring-offset-white"
                }`}
              >
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-500 to-emerald-700 text-2xl font-bold text-white">
                    {initials}
                  </div>
                )}
                {avatarUploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <LoaderCircle className="h-8 w-8 animate-spin text-white" />
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={avatarUploading}
                onClick={() => fileRef.current?.click()}
                className={`mt-3 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  isDark
                    ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700"
                    : "border-emerald-200 bg-white hover:bg-emerald-50"
                }`}
              >
                <Camera size={14} strokeWidth={2.25} />
                Alterar foto
              </button>
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel isDark={isDark}>Nome</FieldLabel>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={inputClass(isDark)}
                    required
                    autoComplete="given-name"
                  />
                </div>
                <div>
                  <FieldLabel isDark={isDark}>Apelido</FieldLabel>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={inputClass(isDark)}
                    required
                    autoComplete="family-name"
                  />
                </div>
              </div>
              <div>
                <FieldLabel isDark={isDark}>Email</FieldLabel>
                <div
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                    isDark ? "border-zinc-800 bg-zinc-950/50 text-zinc-400" : "border-emerald-100 bg-emerald-50/50 text-emerald-900/75"
                  }`}
                >
                  <Mail size={16} className="shrink-0 opacity-60" />
                  <span className="truncate">{user.email}</span>
                  <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide opacity-60">
                    só leitura
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* WhatsApp */}
        <section className={`${cardShell} flex h-full min-h-0 flex-col`}>
          <div
            className={`border-b px-5 py-4 ${isDark ? "border-zinc-800 bg-zinc-900/60" : "border-emerald-100 bg-emerald-50/50"}`}
          >
            <div className="flex items-center gap-2">
              <Phone className={`h-4 w-4 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
              <h3 className={`text-sm font-semibold ${isDark ? "text-zinc-100" : "text-emerald-950"}`}>
                WhatsApp
              </h3>
            </div>
            <p className={`mt-1 text-xs leading-relaxed ${isDark ? "text-zinc-500" : "text-emerald-900/65"}`}>
              Indique o número com código do país (ex.: +351 912 345 678). Opcional — só é visível onde
              autorizar na sua rede.
            </p>
          </div>
          <div className="p-5">
            <FieldLabel isDark={isDark}>Número de telefone / WhatsApp</FieldLabel>
            <input
              value={phoneWhatsapp}
              onChange={(e) => setPhoneWhatsapp(e.target.value)}
              className={inputClass(isDark)}
              placeholder="+351 912 345 678"
              inputMode="tel"
              autoComplete="tel"
            />
          </div>
        </section>

        {/* Redes — largura total quando a grelha tem 2 colunas (Perfil | WhatsApp) */}
        <section className={`${cardShell} 2xl:col-span-2`}>
          <div
            className={`border-b px-5 py-4 ${isDark ? "border-zinc-800 bg-zinc-900/60" : "border-emerald-100 bg-emerald-50/50"}`}
          >
            <div className="flex items-center gap-2">
              <Globe className={`h-4 w-4 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
              <h3 className={`text-sm font-semibold ${isDark ? "text-zinc-100" : "text-emerald-950"}`}>
                Redes e presença online
              </h3>
            </div>
            <p className={`mt-1 text-xs leading-relaxed ${isDark ? "text-zinc-500" : "text-emerald-900/65"}`}>
              Ligações opcionais ao perfil. Pode usar URLs completas ou o nome de utilizador, conforme a rede.
            </p>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <FieldLabel isDark={isDark}>
                <span className="inline-flex items-center gap-1.5">
                  <FaDiscord className="inline h-3.5 w-3.5" /> Discord
                </span>
              </FieldLabel>
              <input
                value={socialDiscord}
                onChange={(e) => setSocialDiscord(e.target.value)}
                className={inputClass(isDark)}
                placeholder="utilizador ou link"
              />
            </div>
            <div>
              <FieldLabel isDark={isDark}>
                <span className="inline-flex items-center gap-1.5">
                  <FaLinkedin className="inline h-3.5 w-3.5" /> LinkedIn
                </span>
              </FieldLabel>
              <input
                value={socialLinkedin}
                onChange={(e) => setSocialLinkedin(e.target.value)}
                className={inputClass(isDark)}
                placeholder="https://linkedin.com/in/..."
              />
            </div>
            <div>
              <FieldLabel isDark={isDark}>
                <span className="inline-flex items-center gap-1.5">
                  <FaYoutube className="inline h-3.5 w-3.5" /> YouTube
                </span>
              </FieldLabel>
              <input
                value={socialYoutube}
                onChange={(e) => setSocialYoutube(e.target.value)}
                className={inputClass(isDark)}
                placeholder="https://youtube.com/@..."
              />
            </div>
            <div>
              <FieldLabel isDark={isDark}>
                <span className="inline-flex items-center gap-1.5">
                  <FaInstagram className="inline h-3.5 w-3.5" /> Instagram
                </span>
              </FieldLabel>
              <input
                value={socialInstagram}
                onChange={(e) => setSocialInstagram(e.target.value)}
                className={inputClass(isDark)}
                placeholder="@utilizador ou URL"
              />
            </div>
            <div>
              <FieldLabel isDark={isDark}>
                <span className="inline-flex items-center gap-1.5">
                  <FaFacebook className="inline h-3.5 w-3.5" /> Facebook
                </span>
              </FieldLabel>
              <input
                value={socialFacebook}
                onChange={(e) => setSocialFacebook(e.target.value)}
                className={inputClass(isDark)}
                placeholder="URL do perfil"
              />
            </div>
            <div>
              <FieldLabel isDark={isDark}>Site</FieldLabel>
              <input
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                className={inputClass(isDark)}
                placeholder="https://"
                inputMode="url"
                autoComplete="url"
              />
            </div>
          </div>
        </section>
        </div>

        {/* Guardar */}
        <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-sm">
            {saveError && <span className="text-red-500">{saveError}</span>}
            {saveOk && !saveError && (
              <span className={isDark ? "text-emerald-400" : "text-emerald-700"}>Alterações guardadas.</span>
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            Guardar alterações
          </button>
        </div>
      </form>

      {/* Zona de perigo */}
      <section
        className={`rounded-2xl border-2 border-dashed ${
          isDark ? "border-red-900/60 bg-red-950/20" : "border-red-200 bg-red-50/40"
        } p-5`}
      >
        <div className="mb-4 flex items-start gap-3">
          <ShieldAlert
            className={`mt-0.5 h-5 w-5 shrink-0 ${isDark ? "text-red-400" : "text-red-700"}`}
          />
          <div>
            <h3 className={`text-sm font-semibold ${isDark ? "text-red-200" : "text-red-900"}`}>
              Zona de perigo
            </h3>
            <p className={`mt-1 text-xs leading-relaxed ${isDark ? "text-red-300/80" : "text-red-900/75"}`}>
              Desativar bloqueia o acesso até reativar com email e senha. Eliminar remove a conta de forma
              permanente (remoção lógica). {hasPassword ? "A sua senha pode ser requerida." : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              setDangerError(null);
              setShowDeactivateConfirm(true);
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
              isDark
                ? "border-amber-800/80 bg-amber-950/40 text-amber-100 hover:bg-amber-950/70"
                : "border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100"
            }`}
          >
            <UserRound size={16} />
            Desativar conta
          </button>
          <button
            type="button"
            onClick={() => {
              setDangerError(null);
              setShowDeleteConfirm(true);
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
              isDark
                ? "border-red-800/80 bg-red-950/40 text-red-100 hover:bg-red-950/70"
                : "border-red-200 bg-red-50 text-red-900 hover:bg-red-100"
            }`}
          >
            <Trash2 size={16} />
            Eliminar conta
          </button>
        </div>
      </section>

      {/* Confirmação 1 — desativar */}
      {showDeactivateConfirm && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setShowDeactivateConfirm(false)}
        >
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-xl ${
              isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "border-emerald-200 bg-white text-emerald-950"
            }`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="deactivate-confirm-title"
            aria-describedby="deactivate-confirm-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 id="deactivate-confirm-title" className="text-lg font-semibold tracking-tight">
              Confirmar desativação
            </h4>
            <p
              id="deactivate-confirm-desc"
              className={`mt-3 text-sm leading-relaxed ${isDark ? "text-zinc-400" : "text-emerald-900/75"}`}
            >
              Tem a certeza? A sua conta ficará inacessível até reativar com email e senha. Todas as
              sessões serão encerradas.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowDeactivateConfirm(false)}
                className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                  isDark ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700" : "border-emerald-200 bg-white hover:bg-emerald-50"
                }`}
              >
                Não, cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeactivateConfirm(false);
                  setDeactivatePassword("");
                  setDangerError(null);
                  setShowDeactivate(true);
                }}
                className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-500"
              >
                Sim, continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação 2 — desativar (senha se aplicável) */}
      {showDeactivate && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setShowDeactivate(false)}
        >
          <div
            className={`w-full max-w-md rounded-2xl border p-5 shadow-xl ${
              isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "border-emerald-200 bg-white text-emerald-950"
            }`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="deactivate-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 id="deactivate-title" className="text-base font-semibold">
              Concluir desativação
            </h4>
            <p className={`mt-2 text-sm ${isDark ? "text-zinc-400" : "text-emerald-900/70"}`}>
              {hasPassword
                ? "Introduza a sua senha para confirmar a desativação da conta."
                : "Confirme para desativar a sua conta. Pode reativar mais tarde com email e o método OAuth utilizado."}
            </p>
            {hasPassword && (
              <div className="mt-4">
                <FieldLabel isDark={isDark}>Senha</FieldLabel>
                <input
                  type="password"
                  value={deactivatePassword}
                  onChange={(e) => setDeactivatePassword(e.target.value)}
                  className={inputClass(isDark)}
                  autoComplete="current-password"
                />
              </div>
            )}
            {dangerError && <p className="mt-3 text-sm text-red-500">{dangerError}</p>}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeactivate(false)}
                className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-semibold ${
                  isDark ? "border-zinc-600 bg-zinc-800" : "border-emerald-200 bg-emerald-50"
                }`}
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={dangerLoading || (hasPassword && !deactivatePassword.trim())}
                onClick={() => void handleDeactivate()}
                className="flex-1 rounded-lg bg-amber-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
              >
                {dangerLoading ? <LoaderCircle className="mx-auto h-4 w-4 animate-spin" /> : "Confirmar desativação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação 1 — eliminar */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setShowDeleteConfirm(false)}
        >
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-xl ${
              isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "border-emerald-200 bg-white text-emerald-950"
            }`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            aria-describedby="delete-confirm-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-red-500" aria-hidden />
              <div>
                <h4 id="delete-confirm-title" className="text-lg font-semibold tracking-tight">
                  Confirmar eliminação
                </h4>
                <p
                  id="delete-confirm-desc"
                  className={`mt-2 text-sm leading-relaxed ${isDark ? "text-zinc-400" : "text-emerald-900/75"}`}
                >
                  Tem a certeza? A eliminação da conta é permanente (remoção lógica). No passo seguinte
                  pediremos a confirmação por texto e, se aplicável, a senha.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                  isDark ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700" : "border-emerald-200 bg-white hover:bg-emerald-50"
                }`}
              >
                Não, manter conta
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeletePassword("");
                  setDeleteConfirm("");
                  setDangerError(null);
                  setShowDelete(true);
                }}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500"
              >
                Sim, continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação 2 — eliminar (senha + EXCLUIR) */}
      {showDelete && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setShowDelete(false)}
        >
          <div
            className={`w-full max-w-md rounded-2xl border p-5 shadow-xl ${
              isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "border-emerald-200 bg-white text-emerald-950"
            }`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-final-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" aria-hidden />
              <div>
                <h4 id="delete-final-title" className="text-base font-semibold">
                  Eliminar conta definitivamente
                </h4>
                <p className={`mt-2 text-sm ${isDark ? "text-zinc-400" : "text-emerald-900/70"}`}>
                  Esta ação não pode ser desfeita. A conta será marcada como eliminada.
                </p>
              </div>
            </div>
            {hasPassword && (
              <div className="mt-4">
                <FieldLabel isDark={isDark}>Senha</FieldLabel>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className={inputClass(isDark)}
                  autoComplete="current-password"
                />
              </div>
            )}
            <div className="mt-4">
              <FieldLabel isDark={isDark}>Digite EXCLUIR para confirmar</FieldLabel>
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                className={inputClass(isDark)}
                placeholder="EXCLUIR"
                autoComplete="off"
              />
            </div>
            {dangerError && <p className="mt-3 text-sm text-red-500">{dangerError}</p>}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-semibold ${
                  isDark ? "border-zinc-600 bg-zinc-800" : "border-emerald-200 bg-emerald-50"
                }`}
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={
                  dangerLoading ||
                  deleteConfirm !== "EXCLUIR" ||
                  (hasPassword && !deletePassword.trim())
                }
                onClick={() => void handleDelete()}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {dangerLoading ? (
                  <LoaderCircle className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  "Confirmar eliminação"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
