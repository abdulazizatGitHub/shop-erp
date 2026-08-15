import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-connection-test-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('openDatabase', () => {
  it('creates the parent directory when it does not exist yet', () => {
    // A fresh install has no app-data directory at all — this is what
    // production first-run looks like, not just a missing db file.
    const dbPath = path.join(workDir, 'does', 'not', 'exist', 'shop.db');
    expect(existsSync(path.dirname(dbPath))).toBe(false);

    const db = openDatabase(dbPath);
    db.close();

    expect(existsSync(path.dirname(dbPath))).toBe(true);
    expect(existsSync(dbPath)).toBe(true);
  });

  it('does not try to create a directory for an in-memory database', () => {
    expect(() => {
      const db = openDatabase(':memory:');
      db.close();
    }).not.toThrow();
  });
});
