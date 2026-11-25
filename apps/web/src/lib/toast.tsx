import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type Toast = { id: number; text: string; tone: "error" | "ok" };
const Ctx = createContext<{ push: (text: string, tone?: Toast["tone"]) => void }>({ push: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === "error" ? 6000 : 3000);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[100] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto max-w-md animate-sheet-in rounded-control px-4 py-3 text-sm font-semibold shadow-pop ${t.tone === "error" ? "bg-danger text-surface" : "bg-fg text-bg"}`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
