"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * Disables itself while the surrounding form action is running. Kept separate
 * from the forms because useFormStatus only reports on its parent <form>.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  disabled = false,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
  /**
   * Held shut until a form is ready to be sent — a typed confirmation that does
   * not match yet, say. A courtesy rather than a guard: the server checks the
   * same thing, because a `disabled` attribute is a suggestion.
   */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  const variants = {
    primary: "bg-hearth-600 text-hearth-50 hover:bg-hearth-500",
    secondary: "border border-hearth-700 text-hearth-200 hover:bg-hearth-800/50",
    danger: "border border-red-900/60 text-red-200 hover:bg-red-950/40",
  } as const;

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`rounded-lg px-4 py-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]}`}
    >
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
