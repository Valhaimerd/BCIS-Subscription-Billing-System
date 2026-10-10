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
  page.on('dialog', (dialog) => dialog.accept());
  await page
    .getByLabel('Username')
    .fill(process.env.SEED_OWNER_USERNAME ?? 'owner');
  await page
    .locator('input[name="password"]')
    .fill(process.env.SEED_OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Home' }).waitFor();
  await page.getByRole('button', { name: 'Collections' }).click();
  await page.getByRole('heading', { name: 'Collection batches' }).waitFor();
  await page.getByRole('button', { name: 'Previous batches' }).waitFor();

  const seededRoute = await page.evaluate(async () => {
    const batches = await globalThis.bcis.collections.list({
      q: '',
      page: 1,
      pageSize: 20,
    });
    const route = batches.items.find((item) => item.accountCount > 0);
    return route
      ? {
          collectorId: route.collectorId,
          collectionAreaId: route.collectionAreaId,
        }
      : null;
  });
  if (!seededRoute)
    throw new Error('A seeded collection route with accounts is required.');
  const seed = Date.now();
  const year = 2100 + (seed % 50);
  const month = String((Math.floor(seed / 50) % 12) + 1).padStart(2, '0');
  const day = String((Math.floor(seed / 600) % 28) + 1).padStart(2, '0');
  await page
    .locator('select[name="collectorId"]')
    .selectOption(seededRoute.collectorId);
  await page
    .locator('select[name="collectionAreaId"]')
    .selectOption(seededRoute.collectionAreaId);
  const batchDate = `${year}-${month}-${day}`;
  await page.locator('input[name="batchDate"]').fill(batchDate);
  await page.getByRole('button', { name: 'Generate route sheet' }).click();
  await page.locator('.success-notice, .form-error').first().waitFor();
  const routeResponse = await page
    .locator('.success-notice, .form-error')
    .first()
    .innerText();
  if (!routeResponse.includes('Route sheet generated'))
    throw new Error(`Route generation failed: ${routeResponse}`);
  await page.getByRole('button', { name: 'Start batch' }).click();
  await page.getByText('Batch moved to IN PROGRESS').waitFor();
  await page.getByRole('button', { name: 'Record' }).first().click();
  await page.locator('.collection-entry input[name="amount"]').fill('20000.00');
  await page.getByRole('button', { name: 'Post collection' }).click();
  await page.getByText(/Receipt RCPT-/).waitFor();

  const gcashReference = `E2E-COLLECTION-${seed}`;
  await page.getByRole('button', { name: 'Record' }).first().click();
  await page
    .locator('.collection-entry select[name="method"]')
    .selectOption('GCASH');
  await page.locator('.collection-entry input[name="amount"]').fill('100.00');
  await page
    .locator('.collection-entry input[name="referenceNumber"]')
    .fill(gcashReference);
  await page
    .locator('.collection-entry input[name="senderDetails"]')
    .fill('Synthetic route sender');
  await page
    .locator('.collection-entry input[name="proof"]')
    .setInputFiles(
      resolve('output/playwright/bcis-task-05-payment-preview.png'),
    );
  await page.getByRole('button', { name: 'Post collection' }).click();
  await page.getByText('GCash proof submitted').waitFor();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Payments' }).click();
  await page.getByRole('tab', { name: 'GCash verification' }).click();
  await page.getByText(gcashReference).click();
  await page.getByRole('button', { name: 'Approve and post' }).click();
  const approvalDialog = page.getByRole('dialog', {
    name: 'Approve GCash payment',
  });
  await approvalDialog.waitFor();
  await approvalDialog.getByRole('button', { name: 'Approve payment' }).click();
  await page.getByText('GCash payment approved').waitFor();
  await page.getByRole('button', { name: 'Collections' }).click();
  await page
    .getByRole('button', { name: new RegExp(`open batch.*${batchDate}`, 'i') })
    .click();
  await page.getByRole('button', { name: 'Submit batch' }).click();
  await page.getByText('Batch moved to SUBMITTED').waitFor();
  await page.locator('.remittance-form input[name="amount"]').fill('20000.00');
  await page.getByRole('button', { name: 'Record remittance' }).click();
  await page.getByText('Cash remittance recorded').waitFor();
  await page.getByRole('button', { name: 'Confirm reconciliation' }).click();
  const reconcileDialog = page.getByRole('dialog', {
    name: 'Confirm reconciliation',
  });
  await reconcileDialog.waitFor();
  await reconcileDialog
    .getByRole('button', { name: 'Confirm reconciliation' })
    .click();
  await page.getByText('Batch moved to RECONCILED').waitFor();
  await page.getByRole('button', { name: 'Confirm and close batch' }).click();
  const closeDialog = page.getByRole('dialog', {
    name: 'Close collection batch',
  });
  await closeDialog.waitFor();
  await closeDialog.getByRole('button', { name: 'Close batch' }).click();
  await page.getByText('Batch moved to CLOSED').waitFor();
  await page.locator('.route-sheet').scrollIntoViewIfNeeded();
  await page.evaluate(() => globalThis.scrollBy(0, -250));
  await page.screenshot({
    path: 'output/playwright/bcis-task-06-balanced-batch.png',
  });
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: '2099-10-08' }).click();
  await page.getByText(/shortage/).waitFor();
  await page.locator('.route-sheet').scrollIntoViewIfNeeded();
  await page.evaluate(() => globalThis.scrollBy(0, -90));
  await page.screenshot({
    path: 'output/playwright/bcis-task-06-shortage.png',
  });

  await page.emulateMedia({ media: 'print' });
  await page.screenshot({
    path: 'output/playwright/bcis-task-06-print-route.png',
    fullPage: true,
  });
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 960, height: 700 });
  await page.screenshot({
    path: 'output/playwright/bcis-task-06-compact.png',
    fullPage: true,
  });
  if (rendererErrors.length)
    throw new Error(`Renderer errors: ${rendererErrors.join(' | ')}`);
  process.stdout.write('Task 6 Electron flow passed.\n');
} finally {
  await application.close();
}
