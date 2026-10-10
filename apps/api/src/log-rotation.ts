import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function rotateLog(
  path: string,
  maxBytes: number,
  retainedFiles: number,
) {
  await mkdir(dirname(path), { recursive: true });
  const current = await stat(path).catch(() => null);
  if (!current || current.size < maxBytes) return false;
  await rm(`${path}.${retainedFiles}`, { force: true });
  for (let index = retainedFiles - 1; index >= 1; index -= 1)
    await rename(`${path}.${index}`, `${path}.${index + 1}`).catch(
      () => undefined,
    );
  await rename(path, `${path}.1`);
  return true;
}
