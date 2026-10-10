export function assertBackupName(value: string) {
  if (!/^bcis-[0-9A-Za-z-]+$/.test(value))
    throw new Error('Invalid backup name.');
  return value;
}

export const expectedRestoreConfirmation = (backupName: string) =>
  `RESTORE ${assertBackupName(backupName)}`;

export function isManifestCompatible(
  manifest: { applicationVersion: string; schemaVersion: string },
  applicationVersion: string,
  schemaVersion: string,
) {
  return (
    manifest.applicationVersion === applicationVersion &&
    manifest.schemaVersion === schemaVersion
  );
}
