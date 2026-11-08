import React, { ReactNode } from "react";

/** Label + control + error, the one pattern every form in the app uses. */
interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}

export const Field: React.FC<FieldProps> = ({
  label,
  htmlFor,
  error,
  required,
  hint,
  children,
}) => (
  <div>
    <label htmlFor={htmlFor} className="field-label">
      {label}
      {required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
    </label>
    {children}
    {hint && !error && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    {error && <p className="field-error">{error}</p>}
  </div>
);

interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input: React.FC<InputProps> = ({ invalid, className = "", ...rest }) => (
  <input
    {...rest}
    aria-invalid={invalid || undefined}
    className={`field-input ${invalid ? "border-red-400 focus:border-red-500 focus:ring-red-500/20" : ""} ${className}`}
  />
);

interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select: React.FC<SelectProps> = ({ invalid, className = "", children, ...rest }) => (
  <select
    {...rest}
    aria-invalid={invalid || undefined}
    className={`field-input appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%2364748b" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>')] bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9 ${
      invalid ? "border-red-400 focus:border-red-500 focus:ring-red-500/20" : ""
    } ${className}`}
  >
    {children}
  </select>
);

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea: React.FC<TextareaProps> = ({ invalid, className = "", ...rest }) => (
  <textarea
    {...rest}
    aria-invalid={invalid || undefined}
    className={`field-input resize-y min-h-[88px] ${
      invalid ? "border-red-400 focus:border-red-500 focus:ring-red-500/20" : ""
    } ${className}`}
  />
);

/** Static value row used by every detail page. */
export const DetailRow: React.FC<{ label: string; children: ReactNode }> = ({
  label,
  children,
}) => (
  <div className="sm:grid sm:grid-cols-[160px_1fr] gap-2 py-2.5 border-b border-slate-100 last:border-0">
    <dt className="text-sm text-slate-500">{label}</dt>
    <dd className="text-sm text-slate-900 font-medium break-words">{children}</dd>
  </div>
);

export default Field;
