import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ModeId } from "@/lib/prompts";
import type { SearchSource } from "@/lib/search";

export type MessageMeta = {
  source?: "gemini";
  model?: string;
  checked?: boolean;
  fixed?: boolean;
  credit?: string;
  verdict?: "like" | "dislike";
  taught?: boolean;
  isError?: boolean;
  /** Web Search: the search status the server reported for this answer. */
  searchStatus?: "on" | "off" | "unavailable";
  /** Web Search: queries the model ran. */
  queries?: string[];
  /** Web Search: the sources the model cited while answering. */
  sources?: SearchSource[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
} & MessageMeta;

export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
};

type ChatStore = {
  conversations: Conversation[];
  activeId: string | null;
  mode: ModeId;
  temperature: number;
  storageWarning: string;
  setTemperature: (temperature: number) => void;
  createConversation: () => string;
  deleteConversation: (id: string) => void;
  setActive: (id: string) => void;
  setMode: (mode: ModeId) => void;
  addMessage: (id: string, message: ChatMessage) => void;
  updateMessage: (conversationId: string, messageId: string, content: string) => void;
  setMessageMeta: (conversationId: string, messageId: string, meta: MessageMeta) => void;
  clearHistory: () => void;
};

const MAX_CONVERSATIONS = 40;
const MAX_MESSAGES = 200;
const MAX_MESSAGE_CHARS = 24_000;

function trim(conversations: Conversation[]): Conversation[] {
  return [...conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS)
    .map((chat) => ({
      ...chat,
      messages: chat.messages.slice(-MAX_MESSAGES).map((message) =>
        message.content.length > MAX_MESSAGE_CHARS
          ? { ...message, content: `${message.content.slice(0, MAX_MESSAGE_CHARS)}\n\n_…truncated to save space_` }
          : message,
      ),
    }));
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      conversations: [],
      activeId: null,
      mode: "smart",
      temperature: 0.65,
      storageWarning: "",
      setTemperature: (temperature) => set({ temperature }),
      createConversation: () => {
        const id = crypto.randomUUID();
        set((state) => ({
          activeId: id,
          conversations: [{ id, title: "New conversation", updatedAt: Date.now(), messages: [] }, ...state.conversations],
        }));
        return id;
      },
      deleteConversation: (id) =>
        set((state) => {
          const remaining = state.conversations.filter((chat) => chat.id !== id);
          const nextActive =
            state.activeId === id ? (remaining[0]?.id ?? null) : state.activeId;
          return {
            conversations: remaining,
            activeId: nextActive,
          };
        }),
      setActive: (activeId) => set({ activeId }),
      setMode: (mode) => set({ mode }),
      addMessage: (id, message) =>
        set((state) => ({
          conversations: state.conversations.map((chat) =>
            chat.id === id
              ? {
                  ...chat,
                  title:
                    chat.messages.length === 0 && message.role === "user"
                      ? message.content.slice(0, 46)
                      : chat.title,
                  updatedAt: Date.now(),
                  messages: [...chat.messages, message],
                }
              : chat,
          ),
        })),
      updateMessage: (conversationId, messageId, content) =>
        set((state) => ({
          conversations: state.conversations.map((chat) =>
            chat.id === conversationId
              ? {
                  ...chat,
                  messages: chat.messages.map((message) =>
                    message.id === messageId ? { ...message, content } : message,
                  ),
                }
              : chat,
          ),
        })),
      setMessageMeta: (conversationId, messageId, meta) =>
        set((state) => ({
          conversations: state.conversations.map((chat) =>
            chat.id === conversationId
              ? {
                  ...chat,
                  messages: chat.messages.map((message) =>
                    message.id === messageId ? { ...message, ...meta } : message,
                  ),
                }
              : chat,
          ),
        })),
      clearHistory: () => set({ conversations: [], activeId: null, storageWarning: "" }),
    }),
    {
      name: "anvik-chat-history",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ conversations, activeId, mode, temperature }) => ({
        conversations: trim(conversations),
        activeId,
        mode,
        temperature,
      }),
      version: 3,
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<ChatStore>;
        return {
          ...state,
          conversations: trim(Array.isArray(state.conversations) ? state.conversations : []),
        } as ChatStore;
      },
    },
  ),
);

export const selectActiveConversation = (state: ChatStore) =>
  state.conversations.find((chat) => chat.id === state.activeId) ?? null;
