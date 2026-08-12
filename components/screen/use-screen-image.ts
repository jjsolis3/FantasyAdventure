"use client";

import { useEffect, useState } from "react";

/**
 * Loads a picture that needs the screen's token.
 *
 * An `<img src>` cannot carry a header, and the obvious way round that — put
 * the token in the query string — is the wrong one. A URL is the most-copied
 * string in computing: it lands in proxy logs and access logs, it is handed to
 * other origins in `Referer`, and it survives in a browser's history on a
 * device the whole house can pick up. A token that opens an adventure should
 * not be in one.
 *
 * So the bytes are fetched with the header, like every other screen request,
 * and handed to the tag as an object URL that means nothing outside this page.
 * Revoked on change, because a television runs for hours and these are whole
 * images.
 */
export function useScreenImage(path: string | null, token: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path || !token) {
      setUrl(null);
      return;
    }

    let revoked = false;
    let created: string | null = null;

    void (async () => {
      try {
        const response = await fetch(path, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok) return;

        const blob = await response.blob();
        // The effect may have been torn down while the bytes were in flight —
        // on a slow television with a big picture this is not rare.
        if (revoked) return;

        created = URL.createObjectURL(blob);
        setUrl(created);
      } catch {
        // A missing picture is not worth saying anything about: the chapter
        // reads perfectly well without one, which is the whole reason art is
        // asked for separately from the turn.
      }
    })();

    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [path, token]);

  return url;
}
