import type { ChatConversationListItem } from "@/lib/api";

/**
 * Indica se a conversa está silenciada para o utilizador actual.
 * `mutedMap` reflecte a lista sincronizada e actualizações optimistas (PATCH de preferências).
 */
export function isConversationMutedForNotifications(
  conversationId: string,
  mutedMap: ReadonlyMap<string, boolean>,
  conversations: ChatConversationListItem[],
): boolean {
  if (mutedMap.has(conversationId)) {
    return mutedMap.get(conversationId) === true;
  }
  const row = conversations.find((c) => c.id === conversationId);
  return row?.muted === true;
}
