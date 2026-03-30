"use client";

import type { ReactNode, RefObject } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { LucideIcon } from "lucide-react";
import { ContactRound, FileText, Image as ImageIcon, Mic, Video } from "lucide-react";

export type AttachmentMenuOption = "imagem" | "video" | "audio" | "documento" | "contato";

type MessageAttachmentMenuProps = {
  isDark: boolean;
  onSelect: (option: AttachmentMenuOption) => void;
  children: ReactNode;
  /** Ao fechar o menu, o foco vai para este elemento em vez de voltar ao botão (evita retângulo de foco no trigger). */
  focusAfterCloseRef?: RefObject<HTMLTextAreaElement | null>;
  /** Controlado: mesma ideia do picker de emoji (borda verde no botão enquanto aberto). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const items: Array<{ id: AttachmentMenuOption; label: string; icon: LucideIcon }> = [
  { id: "imagem", label: "Imagem", icon: ImageIcon },
  { id: "video", label: "Video", icon: Video },
  { id: "audio", label: "Audio", icon: Mic },
  { id: "documento", label: "Documento", icon: FileText },
  { id: "contato", label: "Contato", icon: ContactRound },
];

export function MessageAttachmentMenu({
  isDark,
  onSelect,
  children,
  focusAfterCloseRef,
  open,
  onOpenChange,
}: MessageAttachmentMenuProps) {
  const controlled = open !== undefined && onOpenChange !== undefined;

  return (
    <DropdownMenu.Root
      modal={false}
      {...(controlled ? { open, onOpenChange } : {})}
    >
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={12}
          collisionPadding={16}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            queueMicrotask(() => focusAfterCloseRef?.current?.focus());
          }}
          className={`z-[400] min-w-[200px] rounded-xl border p-1.5 shadow-2xl outline-none ${
            isDark
              ? "border-zinc-700 bg-zinc-900 text-zinc-100"
              : "border-zinc-200 bg-white text-zinc-900"
          }`}
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.id}
              onSelect={() => onSelect(item.id)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium outline-none ring-0 ring-offset-0 focus:outline-none focus:ring-0 data-[highlighted]:outline-none data-[highlighted]:ring-0 ${
                isDark ? "hover:bg-zinc-800 focus:bg-zinc-800 data-[highlighted]:bg-zinc-800" : "hover:bg-zinc-100 focus:bg-zinc-100 data-[highlighted]:bg-zinc-100"
              }`}
            >
              <item.icon size={16} className="shrink-0 opacity-80" />
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
