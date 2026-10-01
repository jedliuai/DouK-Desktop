import React from 'react';
import { useApp } from '../context/AppContext';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export const Toast: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="region" aria-label="通知提示">
      {toasts.map((toast) => {
        let Icon = Info;
        if (toast.type === 'success') Icon = CheckCircle2;
        if (toast.type === 'error') Icon = AlertCircle;

        return (
          <div key={toast.id} className={`toast-item ${toast.type}`}>
            <Icon size={16} />
            <span>{toast.message}</span>
            <button
              type="button"
              className="btn-action-subtle"
              style={{ padding: '2px', color: '#ffffff', opacity: 0.7 }}
              onClick={() => removeToast(toast.id)}
              aria-label="关闭提示"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
