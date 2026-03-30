export type ShareableContact = {
  id: string;
  name: string;
  kind: "direct";
  /** Texto auxiliar (telefone, e-mail). */
  subtitle?: string;
  avatarUrl?: string | null;
};

/** Apenas conversas diretas; grupos nao podem ser enviados como cartao de contato. */
export const MOCK_SHAREABLE_CONTACTS: ShareableContact[] = [
  {
    id: "c-2",
    name: "Suporte Premium",
    kind: "direct",
    subtitle: "+55 11 90000-1000",
  },
  {
    id: "c-3",
    name: "Ana Ribeiro",
    kind: "direct",
    subtitle: "+55 21 98888-7766 · ana.ribeiro@email.com",
  },
  {
    id: "c-4",
    name: "Lucas Mendes",
    kind: "direct",
    subtitle: "+55 31 97777-5544",
  },
  {
    id: "c-6",
    name: "Carlos Almeida",
    kind: "direct",
    subtitle: "+55 11 96666-3322 · carlos.almeida@email.com",
  },
  {
    id: "c-7",
    name: "Mariana Costa",
    kind: "direct",
    subtitle: "+55 48 99999-1100",
  },
];
