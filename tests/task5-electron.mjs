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
  await page.getByRole('button', { name: 'Payments' }).click();
  await page.getByRole('heading', { name: 'Receive payment' }).waitFor();

  await page.getByLabel('Find subscriber').fill('SUB-00001');
  await page.getByRole('button', { name: 'Find' }).click();
  const subscriberSelect = page.locator('select[name="subscriberId"]');
  const subscriberValue = await subscriberSelect
    .locator('option')
    .nth(1)
    .getAttribute('value');
  if (!subscriberValue)
    throw new Error('Subscriber search returned no option.');
  await subscriberSelect.selectOption(subscriberValue);
  await page.getByLabel('Amount (PHP)').fill('10.00');
  await page.getByRole('button', { name: 'Preview allocation' }).click();
  await page.getByText('Remaining subscriber credit').waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-task-05-payment-preview.png',
  });
  await page.getByRole('button', { name: 'Post payment' }).click();
  await page.getByText(/Receipt RCPT-/).waitFor();

  await page.getByRole('tab', { name: 'Payment history' }).click();
  await page.locator('.record-link').first().waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-task-05-history.png',
  });
  await page.locator('.record-link').first().click();
  await page.getByLabel('Receipt detail').waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-task-05-receipt.png',
  });
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('tab', { name: 'Receive payment' }).click();
  await subscriberSelect.selectOption(subscriberValue);
  await page.getByLabel('Amount (PHP)').fill('10.00');
  await page.getByLabel('Method').selectOption('GCASH');
  const suffix = Date.now().toString();
  await page.getByLabel('Reference number').fill(`E2E-GCASH-${suffix}`);
  await page.getByLabel('Sender details').fill('Synthetic E2E sender');
  await page
    .getByLabel('GCash proof image')
    .setInputFiles(
      resolve('output/playwright/bcis-task-05-payment-preview.png'),
    );
  await page.getByRole('button', { name: 'Submit for verification' }).click();
  await page.getByText('GCash proof submitted').waitFor();

  await page.getByRole('tab', { name: 'GCash verification' }).click();
  await page.getByText(`E2E-GCASH-${suffix}`).click();
  await page.getByRole('img', { name: /Proof/ }).waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-task-05-gcash-review.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Approve and post' }).click();
  await page.getByRole('dialog', { name: 'Approve GCash payment' }).waitFor();
  await page.getByRole('button', { name: 'Approve payment' }).click();
  await page.getByText('GCash payment approved').waitFor();

  await page.setViewportSize({ width: 960, height: 700 });
  await page.getByRole('tab', { name: 'Payment history' }).click();
  await page.locator('.record-link').first().waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-task-05-compact.png',
  });
  if (rendererErrors.length)
    throw new Error(`Renderer errors: ${rendererErrors.join(' | ')}`);
  process.stdout.write('Task 5 Electron flow passed.\n');
} finally {
  await application.close();
}
