export type GroupMentionMember = {
  id: string;
  name: string;
  role: string;
  avatarUrl?: string | null;
  /** Menção @todos (todos no grupo). */
  kind?: "member" | "group_all";
};
