import React from "react";
import { Link, useNavigate } from "react-router-dom";

/** Back link + H1 + optional actions, shared by every detail page. */
export const PageHeader: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  backTo?: string;
  backLabel?: string;
  actions?: React.ReactNode;
}> = ({ title, subtitle, backTo, backLabel = "Volver", actions }) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      {backTo && (
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary-600 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {backLabel}
        </button>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 break-words">{title}</h1>
          {subtitle && <div className="text-sm text-slate-500 mt-1">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
};

/** Card wrapper with a heading — used by all detail panels. */
export const Panel: React.FC<{
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, action, children, className = "" }) => (
  <section className={`card ${className}`}>
    {(title || action) && (
      <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
        {title && <h2 className="font-semibold text-slate-900 text-sm sm:text-base">{title}</h2>}
        {action}
      </header>
    )}
    <div className="p-5">{children}</div>
  </section>
);

/** Empty state used when a detail page has no related records yet. */
export const EmptyHint: React.FC<{ message: string; action?: React.ReactNode }> = ({
  message,
  action,
}) => (
  <div className="py-8 text-center">
    <p className="text-sm text-slate-500">{message}</p>
    {action && <div className="mt-3 flex justify-center">{action}</div>}
  </div>
);

export const Crumb: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <Link to={to} className="text-primary-600 hover:underline">
    {children}
  </Link>
);
