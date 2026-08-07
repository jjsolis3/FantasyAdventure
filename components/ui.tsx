import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-hearth-800/60 bg-hearth-900/40 p-6 ${className}`}>
      {children}
    </div>
  );
}

export function PageTitle({ eyebrow, title, lead }: { eyebrow?: string; title: string; lead?: string }) {
  return (
    <header className="mb-10">
      {eyebrow ? (
        <p className="mb-3 text-sm font-medium tracking-[0.2em] text-hearth-400 uppercase">{eyebrow}</p>
      ) : null}
      <h1 className="font-display text-4xl font-semibold text-hearth-100 sm:text-5xl">{title}</h1>
      {lead ? <p className="mt-3 max-w-xl leading-relaxed text-hearth-200/70">{lead}</p> : null}
    </header>
  );
}

export function Field({
  label,
  name,
  type = "text",
  defaultValue,
  value,
  onChange,
  placeholder,
  error,
  hint,
  autoComplete,
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  /** Pass with `onChange` to drive the input from parent state. */
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  const controlled = value !== undefined && onChange !== undefined;

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-hearth-200">{label}</span>
      <input
        name={name}
        type={type}
        {...(controlled
          ? { value, onChange: (event) => onChange(event.target.value) }
          : { defaultValue })}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-lg border bg-hearth-950/60 px-3 py-2 text-hearth-100 placeholder:text-hearth-400/50 focus:outline-none focus:ring-2 ${
          error
            ? "border-red-800/70 focus:ring-red-700/40"
            : "border-hearth-800/70 focus:border-hearth-600 focus:ring-hearth-600/30"
        }`}
      />
      {error ? <span className="mt-1.5 block text-sm text-red-300">{error}</span> : null}
      {hint && !error ? <span className="mt-1.5 block text-sm text-hearth-400">{hint}</span> : null}
    </label>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  options,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-hearth-200">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-hearth-800/70 bg-hearth-950/60 px-3 py-2 text-hearth-100 focus:border-hearth-600 focus:ring-2 focus:ring-hearth-600/30 focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-hearth-950">
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="mt-1.5 block text-sm text-hearth-400">{hint}</span> : null}
    </label>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const tones = {
    error: "border-red-900/50 bg-red-950/30 text-red-200",
    success: "border-moss-600/50 bg-moss-800/30 text-moss-400",
    info: "border-hearth-700/50 bg-hearth-800/30 text-hearth-200",
  } as const;

  return (
    <div role="status" className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}
