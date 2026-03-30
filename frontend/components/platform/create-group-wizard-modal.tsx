"use client";

import { Camera, ChevronLeft, Search, UsersRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Area } from "react-easy-crop";
import type { ContactFriendRow } from "@/lib/api";
import { PhotoCropModal } from "@/components/photo-crop-modal";

type Step = 1 | 2;

function friendInitials(firstName: string, lastName: string) {
  const parts = `${firstName} ${lastName}`.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

async function getCroppedImage(imageSrc: string, area: Area): Promise<string | null> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });
  const canvas = document.createElement("canvas");
  canvas.width = area.width;
  canvas.height = area.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    area.width,
    area.height,
  );
  return canvas.toDataURL("image/jpeg", 0.92);
}

export type CreateGroupWizardModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDark: boolean;
  friends: ContactFriendRow[];
  onSubmit: (params: {
    name: string;
    description?: string;
    memberUserIds: string[];
    avatar: File | null;
  }) => Promise<void>;
};

export function CreateGroupWizardModal({
  open,
  onOpenChange,
  isDark,
  friends,
  onSubmit,
}: CreateGroupWizardModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const reset = useCallback(() => {
    setStep(1);
    setName("");
    setDescription("");
    setAvatarFile(null);
    setAvatarPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setSelectedIds(new Set());
    setMemberSearch("");
    setSubmitting(false);
    setShowCropModal(false);
    setCropSource(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  }, []);

  const filteredFriends = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => {
      const display =
        `${f.peer.firstName} ${f.peer.lastName}`.trim().toLowerCase() || f.peer.email.toLowerCase();
      const email = f.peer.email.toLowerCase();
      return display.includes(q) || email.includes(q);
    });
  }, [friends, memberSearch]);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  const closeCropModal = useCallback(() => {
    setShowCropModal(false);
    setCropSource(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const onCropComplete = useCallback((_croppedArea: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleApplyCrop = useCallback(async () => {
    if (!cropSource || !croppedAreaPixels) return;
    const dataUrl = await getCroppedImage(cropSource, croppedAreaPixels);
    if (!dataUrl) return;
    const blob = await fetch(dataUrl).then((r) => r.blob());
    const file = new File([blob], "group-avatar.jpg", { type: "image/jpeg" });
    setAvatarFile(file);
    setAvatarPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(blob);
    });
    closeCropModal();
  }, [cropSource, croppedAreaPixels, closeCropModal]);

  if (!open) return null;

  const panel = isDark
    ? "border-zinc-600 bg-zinc-900 text-zinc-100"
    : "border-zinc-200 bg-white text-zinc-900";
  const row = isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-50";
  const inputCls = `w-full rounded-md border px-3 py-2 text-sm outline-none transition focus:ring-2 ${
    isDark
      ? "border-zinc-600 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:ring-emerald-500"
      : "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400 focus:ring-emerald-400"
  }`;

  const toggleFriend = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePickAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setCropSource(reader.result);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setShowCropModal(true);
    };
    reader.readAsDataURL(f);
  };

  const clearAvatar = () => {
    setAvatarFile(null);
    setAvatarPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const canNext = name.trim().length > 0;
  const canCreate = selectedIds.size >= 1 && !submitting;

  const handleNext = () => {
    if (!canNext) return;
    setStep(2);
  };

  const handleCreate = async () => {
    if (!canCreate) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        memberUserIds: [...selectedIds],
        avatar: avatarFile,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[420] flex items-center justify-center bg-black/55 p-4"
        role="presentation"
        onClick={() => {
          if (showCropModal) return;
          if (!submitting) onOpenChange(false);
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-group-title"
          className={`flex max-h-[min(520px,88vh)] w-full max-w-md flex-col overflow-hidden rounded-xl border shadow-2xl ${panel}`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            if (showCropModal) {
              e.stopPropagation();
              closeCropModal();
              return;
            }
            if (!submitting) onOpenChange(false);
          }}
        >
        <div
          className={`flex items-center justify-between border-b px-4 py-3 ${
            isDark ? "border-zinc-700" : "border-zinc-200"
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            {step === 2 ? (
              <button
                type="button"
                aria-label="Voltar"
                disabled={submitting}
                onClick={() => setStep(1)}
                className={`rounded-full p-1.5 ${isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"}`}
              >
                <ChevronLeft size={20} />
              </button>
            ) : (
              <UsersRound size={20} className={isDark ? "text-emerald-400" : "text-emerald-600"} />
            )}
            <h2 id="create-group-title" className="truncate text-base font-semibold">
              {step === 1 ? "Novo grupo" : "Adicionar membros"}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
            className={`rounded-full p-2 ${isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"}`}
          >
            <X size={18} />
          </button>
        </div>

        {step === 1 ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            <div className="flex flex-col items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handlePickAvatar}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed transition ${
                  isDark
                    ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700"
                    : "border-zinc-300 bg-zinc-50 hover:bg-zinc-100"
                }`}
              >
                {avatarPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarPreviewUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Camera size={32} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
                )}
              </button>
              {avatarPreviewUrl ? (
                <button
                  type="button"
                  onClick={clearAvatar}
                  className={`text-xs font-medium underline ${isDark ? "text-zinc-400" : "text-zinc-600"}`}
                >
                  Remover foto
                </button>
              ) : (
                <p className={`text-center text-xs ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>
                  Foto do grupo (opcional)
                </p>
              )}
            </div>

            <label className="mt-4 block">
              <span className={`mb-1 block text-xs font-semibold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                Nome do grupo
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Equipa de projeto"
                maxLength={120}
                className={inputCls}
              />
            </label>

            <label className="mt-3 block">
              <span className={`mb-1 block text-xs font-semibold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                Descrição (opcional)
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Sobre o grupo..."
                rows={3}
                maxLength={2000}
                className={`${inputCls} resize-none`}
              />
            </label>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 pt-2 pb-1">
            <p className={`shrink-0 px-2 pb-2 text-xs ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
              Selecione pelo menos um amigo.
            </p>
            {friends.length === 0 ? (
              <p className={`px-2 py-6 text-center text-sm ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>
                Ainda não tem amigos para adicionar.
              </p>
            ) : (
              <>
                <div className="relative mb-2 shrink-0 px-2">
                  <Search
                    size={16}
                    className={`pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 ${
                      isDark ? "text-zinc-500" : "text-zinc-400"
                    }`}
                    aria-hidden
                  />
                  <input
                    type="search"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Pesquisar por nome ou e-mail"
                    autoComplete="off"
                    className={`${inputCls} py-2 pr-3 pl-9`}
                    aria-label="Pesquisar amigos"
                  />
                </div>
                <div className="min-h-0 max-h-[min(340px,48vh)] flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
                  {filteredFriends.length === 0 ? (
                    <p
                      className={`py-8 text-center text-sm ${isDark ? "text-zinc-500" : "text-zinc-600"}`}
                    >
                      Nenhum amigo corresponde à pesquisa.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {filteredFriends.map((f) => {
                        const id = f.peer.id;
                        const display =
                          `${f.peer.firstName} ${f.peer.lastName}`.trim() || f.peer.email;
                        const checked = selectedIds.has(id);
                        const av = f.peer.avatarUrl;
                        return (
                          <li key={id}>
                            <button
                              type="button"
                              onClick={() => toggleFriend(id)}
                              className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition ${row}`}
                            >
                              <input
                                type="checkbox"
                                readOnly
                                checked={checked}
                                className="h-4 w-4 shrink-0 rounded border-zinc-400"
                                aria-hidden
                              />
                              <div
                                className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold text-white ${
                                  isDark ? "bg-zinc-700" : "bg-emerald-600"
                                }`}
                              >
                                {av ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={av} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  friendInitials(f.peer.firstName, f.peer.lastName)
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold">{display}</p>
                                <p
                                  className={`truncate text-xs ${isDark ? "text-zinc-500" : "text-zinc-600"}`}
                                >
                                  {f.peer.email}
                                </p>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div
          className={`flex justify-end gap-2 border-t px-4 py-3 ${
            isDark ? "border-zinc-700" : "border-zinc-200"
          }`}
        >
          {step === 1 ? (
            <>
              <button
                type="button"
                disabled={submitting}
                onClick={() => onOpenChange(false)}
                className={`rounded-md border px-4 py-2 text-sm font-semibold ${
                  isDark ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700" : "border-zinc-300 bg-zinc-100 hover:bg-zinc-200"
                }`}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!canNext || submitting}
                onClick={handleNext}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
              >
                Próximo
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setStep(1)}
                className={`rounded-md border px-4 py-2 text-sm font-semibold ${
                  isDark ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700" : "border-zinc-300 bg-zinc-100 hover:bg-zinc-200"
                }`}
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={!canCreate}
                onClick={() => void handleCreate()}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
              >
                {submitting ? "A criar…" : "Criar grupo"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>

      {showCropModal && cropSource ? (
        <PhotoCropModal
          isDark={isDark}
          imageSrc={cropSource}
          crop={crop}
          zoom={zoom}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          onClose={closeCropModal}
          onCancel={closeCropModal}
          onApply={() => void handleApplyCrop()}
          overlayClassName="z-[430]"
          title="Ajustar foto do grupo"
          idSuffix="-grp"
        />
      ) : null}
    </>
  );
}
