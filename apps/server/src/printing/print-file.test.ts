import { describe, expect, it, vi } from 'vitest';
import { printFile, type OpenPathFn } from './print-file.js';

describe('printFile (switched to shell.openPath, 2026-08-30 — PowerShell -Verb Print hit the documented fallback scenario: Edge ignores the Print verb)', () => {
  it('calls shell.openPath with the exact PDF path and resolves when it returns no error', async () => {
    const openPathFn = vi.fn().mockResolvedValue('') as unknown as OpenPathFn;

    await expect(printFile('C:\\temp\\receipt-1.pdf', openPathFn)).resolves.toBeUndefined();

    expect(openPathFn).toHaveBeenCalledWith('C:\\temp\\receipt-1.pdf');
    expect(openPathFn).toHaveBeenCalledTimes(1);
  });

  it('throws when shell.openPath returns a non-empty error string — openPath never rejects, it resolves with the error message', async () => {
    const openPathFn = vi
      .fn()
      .mockResolvedValue(
        'No application is associated with this file type.',
      ) as unknown as OpenPathFn;

    await expect(printFile('C:\\temp\\receipt-2.pdf', openPathFn)).rejects.toThrow(
      'Print command failed: No application is associated with this file type.',
    );
  });

  it('propagates a genuine rejection from shell.openPath (e.g. an unexpected internal error)', async () => {
    const openPathFn = vi.fn().mockRejectedValue(new Error('unexpected')) as unknown as OpenPathFn;

    await expect(printFile('C:\\temp\\receipt-3.pdf', openPathFn)).rejects.toThrow('unexpected');
  });

  it('passes a path containing a single quote through to openPathFn byte-for-byte, unescaped — BUG-A regression guard: shell.openPath takes the path as a real argument, never as text inside a shell command string, so there is nothing to escape', async () => {
    const openPathFn = vi.fn().mockResolvedValue('') as unknown as OpenPathFn;
    const pathWithQuote = "C:\\temp\\O'Brien's receipt.pdf";

    await printFile(pathWithQuote, openPathFn);

    expect(openPathFn).toHaveBeenCalledWith(pathWithQuote);
  });
});
