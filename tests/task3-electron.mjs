import { _electron as electron } from 'playwright';
import { config as loadEnvironment } from 'dotenv';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

loadEnvironment({ path: resolve('.env'), quiet: true, override: true });
if (!process.env.SEED_OWNER_PASSWORD)
  throw new Error('SEED_OWNER_PASSWORD is required.');
await mkdir('output/playwright', { recursive: true });
const childEnvironment = { ...process.env };
delete childEnvironment.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({
  executablePath: resolve('node_modules/electron/dist/electron.exe'),
  args: [resolve('apps/desktop/out/main/index.js')],
  env: childEnvironment,
});

try {
  const page = await application.firstWindow();
  page.on('pageerror', (error) =>
    process.stderr.write(`Renderer error: ${error.message}\n`),
  );
  page.on('console', (entry) => {
    if (entry.type() === 'error')
      process.stderr.write(`Renderer console: ${entry.text()}\n`);
  });
  await page
    .getByLabel('Username')
    .fill(process.env.SEED_OWNER_USERNAME ?? 'owner');
  await page.getByLabel('Password').fill(process.env.SEED_OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
  await page.getByRole('button', { name: 'Subscribers' }).click();
  await page.getByText('SUB-00001').waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-task-03-subscribers.png',
  });

  const suffix = Date.now().toString().slice(-7);
  await page.getByRole('button', { name: 'Register subscriber' }).click();
  await page.getByLabel('Subscriber number').fill(`SUB-${suffix}`);
  await page.getByLabel('Full name').fill('Rafael Villanueva');
  await page
    .getByLabel('Primary contact', { exact: true })
    .fill(`0919${suffix}`);
  await page
    .getByLabel('Primary address')
    .fill('218 Mabini Street, Barangay San Roque, Central District');
  await page.getByRole('button', { name: 'Save subscriber' }).click();
  await page.getByRole('heading', { name: 'Rafael Villanueva' }).waitFor();

  for (const sequence of [1, 2]) {
    await page.getByLabel('Service number').fill(`SVC-${suffix}-${sequence}`);
    await page.getByLabel('Billing day').fill(String(sequence + 4));
    await page.getByRole('button', { name: 'Add service' }).click();
    await page.getByText(`SVC-${suffix}-${sequence}`).waitFor();
  }
  await page.screenshot({
    path: 'output/playwright/bcis-task-03-profile-services.png',
  });
  await page.getByRole('button', { name: 'Archive' }).click();
  await page.getByText('ARCHIVED').waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-task-03-archived.png',
  });

  await page.getByRole('button', { name: 'Plans' }).click();
  await page.getByRole('heading', { name: 'Service plans' }).waitFor();
  await page.getByText('TV-BASIC').waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-task-03-plans.png',
  });
  process.stdout.write('Task 3 Electron flow passed.\n');
} finally {
  await application.close();
}
