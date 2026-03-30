/** Rótulos em português para papéis de grupo (API em inglês). */
export function formatGroupRoleLabel(role: string): string {
  const r = String(role).toLowerCase();
  if (r === "admin") return "Administrador";
  if (r === "moderator") return "Moderador";
  if (r === "member" || r === "membro") return "Membro";
  return role;
}

export type GroupRole = "admin" | "moderator" | "member";

export function parseGroupRole(role: string): GroupRole {
  const r = String(role).toLowerCase();
  if (r === "admin") return "admin";
  if (r === "moderator") return "moderator";
  return "member";
}
