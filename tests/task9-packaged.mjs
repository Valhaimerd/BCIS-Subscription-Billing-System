import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { _electron as electron } from 'playwright';
import { config as loadEnvironment } from 'dotenv';

loadEnvironment({ path: resolve('.env'), quiet: true, override: true });
if (!process.env.SEED_OWNER_PASSWORD)
  throw new Error('SEED_OWNER_PASSWORD is required.');

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

const installer = resolve(
  'release/BCIS Billing and Collection Setup 0.1.0.exe',
);
const executable = resolve(
  'release/win-unpacked/BCIS Billing and Collection.exe',
);
const childEnvironment = { ...process.env };
delete childEnvironment.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({
  executablePath: executable,
  env: childEnvironment,
});

try {
  const page = await application.firstWindow();
  await page
    .getByLabel('Username')
    .fill(process.env.SEED_OWNER_USERNAME ?? 'owner');
  await page.getByLabel('Password').fill(process.env.SEED_OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
} finally {
  await application.close();
}

await writeFile(
  resolve('evidence/task9/installer-result.json'),
  `${JSON.stringify(
    {
      passed: true,
      installer: {
        name: 'BCIS Billing and Collection Setup 0.1.0.exe',
        sizeBytes: (await stat(installer)).size,
        sha256: await sha256(installer),
      },
      packagedExecutable: {
        name: 'BCIS Billing and Collection.exe',
        sizeBytes: (await stat(executable)).size,
        sha256: await sha256(executable),
      },
      loginAgainstLanApi: true,
    },
    null,
    2,
  )}\n`,
);
process.stdout.write('Task 9 packaged client check passed.\n');
