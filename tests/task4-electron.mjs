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
  await page.getByRole('heading', { name: 'Home' }).waitFor();

  await page.getByRole('button', { name: 'Billing' }).click();
  await page.getByRole('heading', { name: 'Monthly runs' }).waitFor();
  await page.locator('.record-link').first().waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-task-04-billing.png',
  });

  await page.locator('.record-link').first().click();
  await page.getByLabel('Invoice detail').waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-task-04-invoice-detail.png',
  });
  await page.mouse.click(20, 20);
  await page.getByLabel('Invoice detail').waitFor({ state: 'hidden' });
  await page.locator('.record-link').first().click();
  await page.getByLabel('Invoice detail').waitFor();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Subscribers' }).click();
  await page
    .getByRole('button', { name: 'Open profile for Maria Santos' })
    .click();
  await page.getByRole('region', { name: 'Subscriber identity' }).waitFor();
  await page.getByRole('group', { name: 'Service overview' }).waitFor();
  await page
    .getByRole('group', { name: 'Subscriber balance context' })
    .waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-task-04-subscriber-profile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 960, height: 640 });
  await page.screenshot({
    path: 'output/playwright/bcis-task-04-subscriber-profile-compact.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Open collections' }).first().click();
  await page.getByRole('heading', { name: 'Collections' }).waitFor();
  await page.getByRole('button', { name: 'Subscribers' }).click();
  await page.getByRole('region', { name: 'Subscriber identity' }).waitFor();
  await page.getByRole('tab', { name: 'billing' }).click();
  await page
    .getByText(/INV-202610-/)
    .first()
    .waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-task-04-subscriber-billing.png',
    fullPage: true,
  });
  await page.getByRole('tab', { name: 'ledger' }).click();
  await page.getByRole('heading', { name: 'Subscriber ledger' }).waitFor();
  await page.getByLabel('From', { exact: true }).fill('2026-10-01');
  await page.getByLabel('To', { exact: true }).fill('2026-10-31');
  await page.getByRole('button', { name: 'Apply range' }).click();
  await page
    .getByText(/INV-202610-/)
    .first()
    .waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-task-04-soa.png',
    fullPage: true,
  });

  await page.setViewportSize({ width: 900, height: 700 });
  await page.getByRole('button', { name: 'Billing' }).click();
  await page.getByRole('heading', { name: 'Monthly runs' }).waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-task-04-compact.png',
    fullPage: true,
  });

  if (rendererErrors.length)
    throw new Error(`Renderer errors: ${rendererErrors.join(' | ')}`);
  process.stdout.write('Task 4 Electron flow passed.\n');
} finally {
  await application.close();
}
