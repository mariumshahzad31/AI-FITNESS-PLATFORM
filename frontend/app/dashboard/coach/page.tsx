"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { sendCoachMessage, getCoachHistory, apiError } from "@/lib/api";
import { Button, Card, Spinner } from "@/components/ui";

type Msg = { role: "user" | "coach"; text: string };

const SUGGESTIONS = [
  "How do I lose fat without losing muscle?",
  "My knee hurts after running — what should I do?",
  "I have no motivation today.",
  "What should I eat after a workout?",
];

export default function CoachPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const history = await getCoachHistory();
        const restored: Msg[] = history.flatMap((h) => [
          { role: "user" as const, text: h.message },
          { role: "coach" as const, text: h.response },
        ]);
        setMessages(restored);
      } catch {
        /* start fresh */
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (preset?: string) => {
    const value = (preset ?? input).trim();
    if (!value || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: value }]);
    setLoading(true);
    try {
      const res = await sendCoachMessage(value);
      setMessages((m) => [...m, { role: "coach", text: res.reply }]);
    } catch (error) {
      setMessages((m) => [...m, { role: "coach", text: `⚠️ ${apiError(error)}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">AI Coach</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Evidence-based guidance on training, nutrition and recovery.</p>
      </div>

      <Card className="flex h-[min(70vh,640px)] flex-col p-0">
        <div className="flex-1 space-y-4 overflow-y-auto p-5 scrollbar-thin">
          {historyLoading ? (
            <div className="flex h-full items-center justify-center"><Spinner /></div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-500"><Sparkles className="h-6 w-6" /></div>
              <p className="mt-4 font-semibold">Ask your coach anything</p>
              <div className="mt-4 grid max-w-md gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-xl border border-slate-200 p-3 text-left text-sm text-slate-600 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-700 dark:text-slate-300">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === "user"
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                }`}>
                  {m.text}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-800"><Spinner className="h-4 w-4" /></div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex items-center gap-2 border-t border-slate-200 p-4 dark:border-slate-800"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the coach…"
            className="input"
          />
          <Button type="submit" loading={loading} className="shrink-0"><Send className="h-4 w-4" /></Button>
        </form>
      </Card>
    </div>
  );
}
