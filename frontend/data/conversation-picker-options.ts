/** Lista alinhada ao mock do sidebar (contatos e grupos para encaminhar). */
export type ConversationPickerItem = {
  id: string;
  name: string;
  kind: "direct" | "group";
};

export const CONVERSATION_PICKER_OPTIONS: ConversationPickerItem[] = [
  { id: "c-1", name: "Equipe Comercial", kind: "group" },
  { id: "c-2", name: "Suporte Premium", kind: "direct" },
  { id: "c-3", name: "Ana Ribeiro", kind: "direct" },
  { id: "c-4", name: "Lucas Mendes", kind: "direct" },
  { id: "c-5", name: "Grupo Marketing", kind: "group" },
];
