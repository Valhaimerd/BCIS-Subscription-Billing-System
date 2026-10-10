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
  await page.getByRole('button', { name: 'Receivables', exact: true }).click();
  await page.getByRole('heading', { name: 'Accounts receivable' }).waitFor();
  await page.getByText('Total receivables').waitFor();
  await page.getByRole('heading', { name: 'Account follow-up' }).waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-task-07-aging.png',
    fullPage: true,
  });

  await page.locator('.aging-strip button').filter({ hasText: '90+' }).click();
  const candidate = page
    .locator('tbody tr')
    .filter({ hasText: 'Suspension candidate' })
    .first();
  await candidate.waitFor();
  await candidate.locator('.record-link').click();
  await page.getByRole('heading', { name: 'Approve suspension' }).waitFor();
  const bodyOverflow = await page
    .locator('body')
    .evaluate(
      (body) =>
        body.ownerDocument.defaultView?.getComputedStyle(body).overflowY,
    );
  if (bodyOverflow !== 'hidden')
    throw new Error(
      'The service control dialog must lock background scrolling.',
    );
  await page.locator('.service-control').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'output/playwright/bcis-task-07-candidate.png',
  });
  await page.getByRole('button', { name: 'Close' }).click();

  const filters = page.locator('.receivable-table .filter-grid');
  await filters.getByLabel('Age').selectOption('');
  await filters
    .getByRole('textbox', { name: 'Search', exact: true })
    .fill('Renato de Vera');
  await filters.getByRole('button', { name: 'Apply filters' }).click();
  await page.getByText('Renato de Vera').waitFor();
  await page.getByText('Renato de Vera').click();
  await page
    .locator('.service-control-grid')
    .getByText('Temporary suspension due to overdue balance.')
    .waitFor();
  await page.locator('.service-control').scrollIntoViewIfNeeded();
  await page.setViewportSize({ width: 960, height: 640 });
  await page.screenshot({
    path: 'output/playwright/bcis-task-07-service-history.png',
  });
  if (rendererErrors.length)
    throw new Error(`Renderer errors: ${rendererErrors.join(' | ')}`);
  process.stdout.write('Task 7 Electron flow passed.\n');
} finally {
  await application.close();
}
