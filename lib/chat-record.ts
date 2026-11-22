/**
 * Chat persistence — every user message and every ANVIK answer, with the
 * model that produced it. Best-effort by contract: a Supabase outage must
 * never break the answer path.
 *
 * Each exchange gets one chat row (title = first 60 chars of the user's
 * message) and two message rows (user + assistant). IDs are generated
 * client-side so nothing needs to round-trip `return=representation`.
 */

import { sbInsert, supabaseEnabled } from "./supabase";

export type ChatExchange = {
  userId: string;
  userMessage: string;
  answer: string;
  model: string;
  createdAt?: Date;
};

function title(message: string): string {
  const compact = message.trim().replace(/\s+/g, " ");
  return compact.length > 60 ? `${compact.slice(0, 60)}…` : compact;
}

/** Insert the chat + message rows. Returns the chat id, or null on failure. */
export async function recordChatExchange(exchange: ChatExchange): Promise<string | null> {
  if (!supabaseEnabled()) return null;

  const chatId = crypto.randomUUID();
  const createdAt = (exchange.createdAt ?? new Date()).toISOString();
  const userId = exchange.userId.slice(0, 128) || "anonymous";

  const chatOk = await sbInsert("chats", [
    { id: chatId, user_id: userId, title: title(exchange.userMessage), created_at: createdAt },
  ]);
  if (!chatOk) return null;

  await sbInsert("messages", [
    {
      id: crypto.randomUUID(),
      chat_id: chatId,
      role: "user",
      content: exchange.userMessage.slice(0, 4000),
      model_used: null,
      created_at: createdAt,
    },
    {
      id: crypto.randomUUID(),
      chat_id: chatId,
      role: "assistant",
      content: exchange.answer.slice(0, 20000),
      model_used: exchange.model,
      created_at: new Date().toISOString(),
    },
  ]);

  return chatId;
}
