import { describe, expect, it } from 'vitest';

import {
  assertBackupName,
  expectedRestoreConfirmation,
  isManifestCompatible,
} from './backup-rules.js';

describe('backup rules', () => {
  it('accepts generated names and rejects path traversal', () => {
    expect(assertBackupName('bcis-20261007T010203Z-a1b2c3')).toBe(
      'bcis-20261007T010203Z-a1b2c3',
    );
    expect(() => assertBackupName('../database')).toThrow('backup name');
    expect(() => assertBackupName('C:\\temp\\backup')).toThrow('backup name');
  });

  it('requires a backup-specific restore confirmation', () => {
    expect(expectedRestoreConfirmation('bcis-example')).toBe(
      'RESTORE bcis-example',
    );
  });

  it('requires matching application and schema versions', () => {
    const manifest = { applicationVersion: '0.1.0', schemaVersion: '0007' };
    expect(isManifestCompatible(manifest, '0.1.0', '0007')).toBe(true);
    expect(isManifestCompatible(manifest, '0.2.0', '0007')).toBe(false);
    expect(isManifestCompatible(manifest, '0.1.0', '0008')).toBe(false);
  });
});
