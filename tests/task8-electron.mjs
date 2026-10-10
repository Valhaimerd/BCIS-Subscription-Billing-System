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
  const rendererErrors = [];
  page.on('pageerror', (error) => rendererErrors.push(error.message));
  page.on('console', (entry) => {
    if (entry.type() === 'error') rendererErrors.push(entry.text());
  });
  await page
    .getByLabel('Username')
    .fill(process.env.SEED_OWNER_USERNAME ?? 'owner');
  await page
    .locator('input[name="password"]')
    .fill(process.env.SEED_OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page
    .getByRole('heading', {
      name: 'Billing, collections, and follow-up',
    })
    .waitFor();
  await page.getByText('Billing versus collection').waitFor();
  await page.getByRole('heading', { name: 'Recent payments' }).waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-task-08-dashboard.png',
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await page.getByRole('heading', { name: 'Report filters' }).waitFor();
  await page.getByRole('button', { name: 'Preview report' }).click();
  await page
    .getByRole('heading', { name: 'Monthly Collection Report' })
    .waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-task-08-report-preview.png',
    fullPage: true,
  });
  await page.emulateMedia({ media: 'print' });
  await page.screenshot({
    path: 'output/playwright/bcis-task-08-report-print.png',
    fullPage: true,
  });
  await page.emulateMedia({ media: 'screen' });

  await page
    .locator('.report-controls select')
    .first()
    .selectOption('AR_AGING');
  await page.getByRole('button', { name: 'Preview report' }).click();
  await page
    .getByRole('heading', { name: 'Accounts Receivable Aging Report' })
    .waitFor();
  await page.setViewportSize({ width: 960, height: 700 });
  await page.screenshot({
    path: 'output/playwright/bcis-task-08-compact.png',
    fullPage: true,
  });
  if (rendererErrors.length)
    throw new Error(`Renderer errors: ${rendererErrors.join(' | ')}`);
  process.stdout.write('Task 8 Electron flow passed.\n');
} finally {
  await application.close();
}
