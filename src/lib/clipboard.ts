/**
 * Clipboard helpers for share links.
 *
 * The Clipboard API is an enhancement: it can be missing, blocked by
 * permissions policy, unavailable in an insecure context, or rejected by the
 * reader. A failed copy must never throw into the story controller, so every
 * path resolves to a `CopyResult`.
 *
 * The fallback uses a hidden textarea and `document.execCommand('copy')`, the
 * only copy path available in older browsers and some embedded webviews. It is
 * deliberately best-effort: a `true` return means the command reported
 * success, not that every platform permission was granted.
 */

export type CopyMethod = 'clipboard' | 'fallback' | 'none';

export interface CopyResult {
  readonly ok: boolean;
  readonly method: CopyMethod;
  /** Diagnostic text for logs and the UI. Never includes the copied value. */
  readonly error?: string;
}

/** The subset of `navigator.clipboard` this module needs. */
export interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

/**
 * Injectable environment. Production callers use the defaults; unit tests pass
 * fakes so the unavailable, denied, and success paths are deterministic.
 */
export interface ClipboardEnvironment {
  readonly clipboard: ClipboardLike | null;
  readonly document: Document | null;
}

function defaultEnvironment(): ClipboardEnvironment {
  let clipboard: ClipboardLike | null = null;

  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard !== undefined &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      clipboard = navigator.clipboard;
    }
  } catch {
    // Accessing navigator.clipboard can throw in a sandboxed frame.
    clipboard = null;
  }

  return {
    clipboard,
    document: typeof document === 'undefined' ? null : document,
  };
}

function copyWithFallback(text: string, documentValue: Document | null): boolean {
  if (documentValue === null) return false;

  let textarea: HTMLTextAreaElement | null = null;

  try {
    if (documentValue.body === null) return false;

    textarea = documentValue.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.setAttribute('aria-hidden', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.left = '-1000px';
    textarea.style.opacity = '0';
    documentValue.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    const copied =
      typeof documentValue.execCommand === 'function' ? documentValue.execCommand('copy') : false;
    return copied;
  } catch {
    return false;
  } finally {
    try {
      textarea?.remove();
    } catch {
      // Removing a detached node must not mask the copy result.
    }
  }
}

/**
 * Copy text to the clipboard.
 *
 * Tries the async Clipboard API first, then the legacy fallback. Resolves with
 * `ok: false` and `method: 'none'` when neither path is available or both are
 * denied. It never rejects.
 */
export async function copyText(
  text: string,
  environment: ClipboardEnvironment = defaultEnvironment(),
): Promise<CopyResult> {
  if (text.length === 0) {
    return { ok: false, method: 'none', error: 'Nothing to copy.' };
  }

  const clipboard = environment.clipboard;
  if (clipboard !== null) {
    try {
      await clipboard.writeText(text);
      return { ok: true, method: 'clipboard' };
    } catch {
      // Fall through to the legacy path. A denied Clipboard API is common in
      // iframes and in browsers that require a direct user gesture.
    }
  }

  if (copyWithFallback(text, environment.document)) {
    return { ok: true, method: 'fallback' };
  }

  return {
    ok: false,
    method: 'none',
    error: 'Clipboard unavailable or permission denied.',
  };
}

/** Copy a share URL. Kept as a named API so call sites read intentionally. */
export function shareUrl(
  url: string,
  environment: ClipboardEnvironment = defaultEnvironment(),
): Promise<CopyResult> {
  return copyText(url, environment);
}
