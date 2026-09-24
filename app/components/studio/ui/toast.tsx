/**
 * Toasts (admin-architecture §4.8): bottom-right on desktop, full width on
 * mobile, at most three. Success toasts are polite and dismiss after 4 s
 * (paused while hovered or focused); errors are alerts that stay until
 * dismissed. Optional action (e.g. "Undo", "View live").
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ToastTone = "success" | "error" | "info";

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  action?: { label: string; onAction?: () => void; href?: string };
}

interface ToastItem extends ToastInput {
  id: number;
}

interface ToastApi {
  show: (toast: ToastInput) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi>({
  show: () => {},
  dismiss: () => {},
});

const SUCCESS_MS = 4000;

function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const tone = toast.tone ?? "success";

  useEffect(() => {
    if (tone === "error" || paused) return;
    timer.current = window.setTimeout(() => onDismiss(toast.id), SUCCESS_MS);
    return () => window.clearTimeout(timer.current);
  }, [tone, paused, onDismiss, toast.id]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover/focus only pause the dismiss timer; the toast's own controls are real buttons and links
    <div
      className={`studio-toast studio-toast--${tone}`}
      role={tone === "error" ? "alert" : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p className="studio-toast__message">{toast.message}</p>
      {toast.action ? (
        toast.action.href ? (
          <a className="studio-toast__action" href={toast.action.href}>
            {toast.action.label}
          </a>
        ) : (
          <button
            type="button"
            className="studio-toast__action"
            onClick={() => {
              toast.action?.onAction?.();
              onDismiss(toast.id);
            }}
          >
            {toast.action.label}
          </button>
        )
      ) : null}
      <button
        type="button"
        className="studio-toast__close"
        aria-label="Dismiss"
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);
  const show = useCallback((toast: ToastInput) => {
    counter.current += 1;
    const id = counter.current;
    setToasts((items) => [...items, { ...toast, id }].slice(-3));
  }, []);
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="studio-toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
