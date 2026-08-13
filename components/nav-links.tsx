"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The two places a family actually goes.
 *
 * "Adventures" and "Adventurers" differ by two letters, sit next to each other,
 * and are set in the same weight and colour — which meant the only way to tell
 * them apart was to read carefully, every time, forever. So each has an icon
 * that says what kind of thing it leads to, and the section you are in is
 * marked rather than left to be inferred from the page you happen to be on.
 *
 * The second is labelled "Characters" here. The app calls them adventurers
 * everywhere else and will go on doing so, but a navigation bar is the one
 * place where being unmistakable beats being in voice.
 *
 * On a phone the words come off and the icons stay. Both labels plus the
 * wordmark plus the account button came to about 500 pixels, which is more than
 * a phone has — so every signed-in page scrolled sideways, and every centred
 * column on it was squeezed to fit a document wider than the screen. The
 * stat blurbs in the character builder were coming out one word per line
 * because of this. The icons carry it alone precisely because they were added
 * to tell these two apart in the first place, and the label survives for
 * screen readers, where there is no width to run out of.
 */
export function NavLinks() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1">
      <NavLink href="/campaigns" active={pathname.startsWith("/campaigns")} label="Adventures">
        {/* An open book: the stories. */}
        <path
          d="M2 4.5c2.5-1 4.5-1 6 0v9c-1.5-1-3.5-1-6 0v-9ZM14 4.5c-2.5-1-4.5-1-6 0v9c1.5-1 3.5-1 6 0v-9Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
          fill="none"
        />
      </NavLink>

      <NavLink href="/characters" active={pathname.startsWith("/characters")} label="Characters">
        {/* Two people: the party. */}
        <circle cx="6.2" cy="5.5" r="2.4" stroke="currentColor" strokeWidth="1.3" fill="none" />
        <path
          d="M1.8 13.2c0-2.3 2-3.8 4.4-3.8s4.4 1.5 4.4 3.8"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M11.2 4.1a2.2 2.2 0 0 1 0 4.3M12 9.8c1.4.5 2.3 1.7 2.3 3.4"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          fill="none"
        />
      </NavLink>
    </div>
  );
}

function NavLink({
  href,
  active,
  label,
  children,
}: {
  href: string;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      title={label}
      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors sm:px-3 ${
        active
          ? "bg-hearth-800/60 text-hearth-50"
          : "text-hearth-300 hover:bg-hearth-800/30 hover:text-hearth-100"
      }`}
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden>
        {children}
      </svg>
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
