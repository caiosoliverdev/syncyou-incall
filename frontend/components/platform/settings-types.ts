export type SettingsSectionId =
  | "account"
  | "security"
  | "sessions"
  | "fourT"
  | "integrations";

export const SETTINGS_SECTIONS: {
  id: SettingsSectionId;
  label: string;
  description: string;
}[] = [
  { id: "account", label: "Conta", description: "Perfil e dados da conta" },
  { id: "security", label: "Segurança", description: "Senha e autenticação" },
  { id: "sessions", label: "Sessões", description: "Sessões em linha e desligar remotamente" },
  { id: "fourT", label: "4T-IA", description: "Assistente e preferências de IA" },
  { id: "integrations", label: "Integrações", description: "Serviços ligados ao SyncYou" },
];
