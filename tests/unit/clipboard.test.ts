import { describe, expect, it, vi } from 'vitest';
import { type ClipboardEnvironment, copyText, shareUrl } from '../../src/lib/clipboard';

function fakeDocument(execResult: boolean): Document {
  const textarea = {
    value: '',
    style: {} as CSSStyleDeclaration,
    setAttribute: () => undefined,
    select: () => undefined,
    setSelectionRange: () => undefined,
    remove: () => undefined,
  };

  return {
    body: {
      appendChild: () => textarea,
    },
    createElement: () => textarea,
    execCommand: () => execResult,
  } as unknown as Document;
}

function environment(
  clipboard: ClipboardEnvironment['clipboard'],
  documentValue: Document | null = null,
): ClipboardEnvironment {
  return { clipboard, document: documentValue };
}

describe('copyText', () => {
  it('uses the Clipboard API when it succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    const result = await copyText(
      'https://example.com/story?seed=7#the-turn',
      environment({ writeText }),
    );

    expect(result).toEqual({ ok: true, method: 'clipboard' });
    expect(writeText).toHaveBeenCalledWith('https://example.com/story?seed=7#the-turn');
  });

  it('returns failure when the Clipboard API and fallback are unavailable', async () => {
    const result = await copyText('https://example.com/story', environment(null, null));

    expect(result.ok).toBe(false);
    expect(result.method).toBe('none');
    expect(result.error).toBeDefined();
  });

  it('does not throw when the Clipboard API is denied', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));

    const result = await copyText('https://example.com/story', environment({ writeText }, null));

    expect(result.ok).toBe(false);
    expect(result.method).toBe('none');
  });

  it('falls back to execCommand when the Clipboard API is denied', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));

    const result = await copyText(
      'https://example.com/story',
      environment({ writeText }, fakeDocument(true)),
    );

    expect(result).toEqual({ ok: true, method: 'fallback' });
  });

  it('falls back when the Clipboard API is missing', async () => {
    const result = await copyText(
      'https://example.com/story',
      environment(null, fakeDocument(true)),
    );

    expect(result).toEqual({ ok: true, method: 'fallback' });
  });

  it('reports failure when the fallback command returns false', async () => {
    const result = await copyText(
      'https://example.com/story',
      environment(null, fakeDocument(false)),
    );

    expect(result).toEqual({
      ok: false,
      method: 'none',
      error: 'Clipboard unavailable or permission denied.',
    });
  });

  it('does not throw when the fallback DOM path throws', async () => {
    const throwingDocument = {
      body: {
        appendChild: () => {
          throw new Error('blocked');
        },
      },
      createElement: () => {
        throw new Error('blocked');
      },
      execCommand: () => true,
    } as unknown as Document;

    const result = await copyText('https://example.com/story', environment(null, throwingDocument));

    expect(result.ok).toBe(false);
    expect(result.method).toBe('none');
  });

  it('rejects empty text without touching the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    const result = await copyText('', environment({ writeText }));

    expect(result.ok).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('works in a Node-like environment with no browser globals', async () => {
    const result = await copyText('https://example.com/story');

    expect(result.ok).toBe(false);
    expect(result.method).toBe('none');
  });
});

describe('shareUrl', () => {
  it('copies the provided absolute URL through the same safe path', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    const result = await shareUrl(
      'https://algorithm-stories.example.com/dev/story-smoke?seed=7#the-turn',
      environment({ writeText }),
    );

    expect(result.ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith(
      'https://algorithm-stories.example.com/dev/story-smoke?seed=7#the-turn',
    );
  });
});
