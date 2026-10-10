import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { rotateLog } from './log-rotation.js';

let directory = '';
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('rotateLog', () => {
  it('rotates an oversized log and keeps the configured generations', async () => {
    directory = await mkdtemp(join(tmpdir(), 'bcis-log-'));
    const path = join(directory, 'api.log');
    await writeFile(path, '12345');
    await writeFile(`${path}.1`, 'older');
    expect(await rotateLog(path, 5, 2)).toBe(true);
    expect(await readFile(`${path}.1`, 'utf8')).toBe('12345');
    expect(await readFile(`${path}.2`, 'utf8')).toBe('older');
  });
});
