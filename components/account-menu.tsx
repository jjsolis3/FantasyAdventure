"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/lib/auth/actions";

/**
 * The account menu, behind an avatar.
 *
 * Everything that is about *you* rather than about the game lives here —
 * profile, the administrator's settings, and signing out — which takes four
 * items off a bar that a family looks at every evening and only ever uses two
 * of. Signing out in particular was a button of its own, competing for
 * attention with the thing people came to do.
 *
 * Initials rather than a picture: an account is a household, not a character,
 * and the portraits belong to adventurers.
 */
export function AccountMenu({
  displayName,
  email,
  isAdmin,
}: {
  displayName: string;
  email: string;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Navigating is finishing with the menu. Without this it stays open over the
  // page it just moved to, which reads as a bug rather than a menu.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${displayName}`}
        className="flex items-center gap-2 rounded-full border border-hearth-700/60 bg-hearth-800/40 py-1 pr-3 pl-1 transition-colors hover:border-hearth-600 hover:bg-hearth-800/70"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-hearth-600 text-sm font-medium text-hearth-50">
          {initialsOf(displayName)}
        </span>
        <span className="hidden text-sm text-hearth-200 sm:inline">{displayName}</span>
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-hearth-400" aria-hidden fill="none">
          <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-hearth-800/70 bg-hearth-950/95 shadow-xl backdrop-blur"
        >
          <div className="border-b border-hearth-800/60 px-4 py-3">
            <p className="truncate text-sm text-hearth-100">{displayName}</p>
            <p className="truncate text-xs text-hearth-500">{email}</p>
          </div>

          <MenuLink href="/profile">Your profile</MenuLink>

          {/* Only an administrator has anywhere to go here, and the rest of a
              household should not be shown a door they cannot open. */}
          {isAdmin ? <MenuLink href="/settings">Settings</MenuLink> : null}

          <div className="border-t border-hearth-800/60">
            <form action={logoutAction}>
              <button
                type="submit"
                role="menuitem"
                className="block w-full px-4 py-2.5 text-left text-sm text-hearth-400 transition-colors hover:bg-hearth-800/50 hover:text-hearth-200"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="block px-4 py-2.5 text-sm text-hearth-200 transition-colors hover:bg-hearth-800/50 hover:text-hearth-50"
    >
      {children}
    </Link>
  );
}

/**
 * Up to two initials, from however many words the name has.
 *
 * "Dad" is a perfectly ordinary display name here, so one letter has to look
 * deliberate rather than broken.
 */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toLocaleUpperCase();
}
