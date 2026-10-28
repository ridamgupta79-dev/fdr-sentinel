import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";

type ToastTone = "success" | "error" | "info" | "warning";
type ToastItem = { id: number; tone: ToastTone; message: string };

const ToastContext = createContext<{ push: (message: string, tone?: ToastTone) => void } | null>(null);

const TONE_ICONS: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 size={16} />,
  error: <XCircle size={16} />,
  info: <Info size={16} />,
  warning: <TriangleAlert size={16} />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((message: string, tone: ToastTone = "success") => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts(current => [...current.slice(-3), { id, tone, message }]);
    window.setTimeout(() => {
      setToasts(current => current.filter(item => item.id !== id));
    }, 5000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.tone}`} role="status">
            <span className="toast-icon">{TONE_ICONS[toast.tone]}</span>
            <span>{toast.message}</span>
            <button type="button" className="toast-close" aria-label="Dismiss"
              onClick={() => setToasts(current => current.filter(item => item.id !== toast.id))}><X size={13} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
