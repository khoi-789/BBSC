'use client';
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

const ICONS = {
  success: <CheckCircle size={16} className="text-green-600 shrink-0" />,
  error:   <XCircle size={16} className="text-red-600 shrink-0" />,
  info:    <Info size={16} className="text-blue-600 shrink-0" />,
  warning: <AlertTriangle size={16} className="text-yellow-600 shrink-0" />,
};

const TYPE_CLASS: Record<ToastType, string> = {
  success: 'toast-success',
  error:   'toast-error',
  info:    'toast-info',
  warning: 'toast-warning',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${TYPE_CLASS[t.type]}`}>
            {ICONS[t.type]}
            <span className="flex-1 text-slate-800">{t.message}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              className="text-slate-400 hover:text-slate-600 ml-2"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
