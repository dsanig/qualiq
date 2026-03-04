import { useState, useRef, useEffect, useMemo } from "react";
import { Send, Bot, User, Trash2, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

const initialAssistantMessage: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Bienvenido al Asistente IA de QualiQ. Estoy listo para ayudarte con consultas sobre tus procesos, incidencias y documentación de cumplimiento.",
  timestamp: new Date(),
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

type Msg = { role: "user" | "assistant"; content: string };

async function streamChat({
  messages,
  accessToken,
  onDelta,
  onDone,
  onError,
}: {
  messages: Msg[];
  accessToken: string;
  onDelta: (deltaText: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ messages }),
  });

  if (resp.status === 429) {
    onError("Límite de consultas excedido. Por favor, inténtelo más tarde.");
    return;
  }
  if (resp.status === 402) {
    onError("Se requiere añadir créditos para continuar usando el asistente IA.");
    return;
  }
  if (!resp.ok || !resp.body) {
    onError("Error al conectar con el asistente. Por favor, inténtelo de nuevo.");
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);

      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") {
        streamDone = true;
        break;
      }

      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        textBuffer = line + "\n" + textBuffer;
        break;
      }
    }
  }

  if (textBuffer.trim()) {
    for (let raw of textBuffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (raw.startsWith(":") || raw.trim() === "") continue;
      if (!raw.startsWith("data: ")) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        /* ignore partial leftovers */
      }
    }
  }

  onDone();
}

const STORAGE_KEY = "qualia-chat-sessions";

const getInitialChats = (): ChatSession[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as ChatSession[];
      return parsed.map((chat) => ({
        ...chat,
        messages: chat.messages.map((message) => ({
          ...message,
          timestamp: new Date(message.timestamp),
        })),
      }));
    } catch {
      return [];
    }
  }
  return [];
};

export function ChatbotView() {
  const [chats, setChats] = useState<ChatSession[]>(() => {
    const initialChats = getInitialChats();
    if (initialChats.length > 0) return initialChats;
    return [
      {
        id: "chat-1",
        title: "Nuevo chat",
        messages: [initialAssistantMessage],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
  });
  const [activeChatId, setActiveChatId] = useState(() => chats[0]?.id ?? "chat-1");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? chats[0],
    [chats, activeChatId]
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages]);

  const createNewChat = () => {
    const newChat: ChatSession = {
      id: `chat-${Date.now()}`,
      title: "Nuevo chat",
      messages: [initialAssistantMessage],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
  };

  const deleteChat = (chatId: string) => {
    setChats((prev) => {
      const next = prev.filter((chat) => chat.id !== chatId);
      if (chatId === activeChatId) {
        setActiveChatId(next[0]?.id ?? "");
      }
      return next.length > 0 ? next : [
        {
          id: "chat-1",
          title: "Nuevo chat",
          messages: [initialAssistantMessage],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    });
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || !activeChat) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    const updatedChat: ChatSession = {
      ...activeChat,
      title: activeChat.title === "Nuevo chat" ? input.slice(0, 40) : activeChat.title,
      messages: [...activeChat.messages, userMessage],
      updatedAt: new Date().toISOString(),
    };

    setChats((prev) => prev.map((chat) => (chat.id === activeChat.id ? updatedChat : chat)));
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";
    const upsertAssistant = (nextChunk: string) => {
      assistantSoFar += nextChunk;
      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== activeChat.id) return chat;
          const last = chat.messages[chat.messages.length - 1];
          if (last?.role === "assistant" && last.id.startsWith("streaming-")) {
            return {
              ...chat,
              messages: chat.messages.map((message, index) =>
                index === chat.messages.length - 1
                  ? { ...message, content: assistantSoFar }
                  : message
              ),
            };
          }
          return {
            ...chat,
            messages: [
              ...chat.messages,
              {
                id: `streaming-${Date.now()}`,
                role: "assistant",
                content: assistantSoFar,
                timestamp: new Date(),
              },
            ],
          };
        })
      );
    };

    try {
      const chatMessages = updatedChat.messages
        .filter((message) => message.id !== "welcome")
        .map((message) => ({ role: message.role, content: message.content }));

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("No hay sesión activa para consultar el asistente IA.");
      }

      await streamChat({
        messages: chatMessages,
        accessToken: session.access_token,
        onDelta: (chunk) => upsertAssistant(chunk),
        onDone: () => setIsLoading(false),
        onError: (error) => {
          toast({
            title: "Error",
            description: error,
            variant: "destructive",
          });
          setIsLoading(false);
        },
      });
    } catch {
      toast({
        title: "Error",
        description: "Error al conectar con el asistente. Por favor, inténtelo de nuevo.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6 animate-fade-in">
      {/* Chat Sessions Sidebar */}
      <div className="w-72 bg-card rounded-lg border border-border flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Chats</h3>
            <p className="text-xs text-muted-foreground">Historial persistente</p>
          </div>
          <Button variant="accent" size="icon" onClick={createNewChat}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {chats.map((chat) => {
            const lastMessage = chat.messages[chat.messages.length - 1];
            return (
              <div
                key={chat.id}
                className={cn(
                  "group rounded-lg border p-3 cursor-pointer transition-colors",
                  chat.id === activeChatId
                    ? "border-accent bg-accent/10"
                    : "border-border hover:bg-secondary/50"
                )}
                onClick={() => setActiveChatId(chat.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground truncate">{chat.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {lastMessage?.content ?? "Sin mensajes"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteChat(chat.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-card rounded-lg border border-border overflow-hidden">
        {/* Chat Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-secondary/30">
          <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Asistente LLM de QualiQ</h3>
            <p className="text-xs text-muted-foreground">
              Sesión activa: {activeChat?.title ?? "Nuevo chat"}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeChat?.messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex gap-3", message.role === "user" && "justify-end")}
            >
              {message.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-accent" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[70%] rounded-lg px-4 py-3",
                  message.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary"
                )}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
              {message.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}

          {isLoading && activeChat?.messages[activeChat.messages.length - 1]?.role === "user" && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-accent" />
              </div>
              <div className="bg-secondary rounded-lg px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" />
                  <span className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse delay-100" />
                  <span className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse delay-200" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Escriba su consulta..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              variant="accent"
              size="icon"
              className="h-10 w-10"
              disabled={isLoading || !input.trim()}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
