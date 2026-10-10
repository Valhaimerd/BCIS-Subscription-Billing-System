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
  await page.getByRole('button', { name: 'Plans' }).click();
  await page.getByRole('heading', { name: 'Service plans' }).waitFor();
  const plansNavigation = page.getByRole('button', { name: 'Plans' });
  if (
    await plansNavigation.evaluate((element) =>
      element.matches(':focus-visible'),
    )
  )
    throw new Error('Mouse navigation left a misleading keyboard focus ring.');
  await page
    .getByRole('searchbox', { name: 'Search service plans' })
    .fill('NET');
  await page.getByLabel('Plan status').selectOption('active');
  if (!(await page.locator('tbody tr').count()))
    throw new Error('Plan search and active status filter returned no plans.');
  const priceTrigger = page
    .getByRole('button', { name: 'Change price' })
    .first();
  await priceTrigger.click();
  const priceDialog = page.getByRole('dialog', { name: 'Change plan price' });
  await priceDialog.waitFor();
  await priceDialog.getByLabel('Reason for price change').waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-task-09-plan-price-dialog.png',
  });
  await page.keyboard.press('Escape');
  await priceDialog.waitFor({ state: 'hidden' });
  if (
    !(await priceTrigger.evaluate(
      (element) => element === element.ownerDocument.activeElement,
    ))
  )
    throw new Error('Escape did not return focus to the plan price action.');
  await priceTrigger.click();
  await priceDialog.waitFor();
  await priceDialog.getByRole('button', { name: 'Cancel' }).click();
  await priceDialog.waitFor({ state: 'hidden' });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Add service plan' }).click();
  await page.getByLabel('Service type').selectOption('CABLE');
  if (await page.getByLabel('Speed (Mbps)').count())
    throw new Error('Cable plan entry should not ask for Internet speed.');
  await page.getByLabel('Channels').waitFor();
  const formAnimation = await page
    .locator('.plan-create-form')
    .evaluate((element) => {
      const view = element.ownerDocument.defaultView;
      return view?.getComputedStyle(element).animationName ?? 'none';
    });
  if (formAnimation !== 'none')
    throw new Error(
      'Plan form animation should be disabled for reduced motion.',
    );
  await page
    .locator('.plan-create-form')
    .getByRole('button', { name: 'Cancel' })
    .click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await page.getByRole('button', { name: 'Backup & recovery' }).click();
  await page.getByRole('heading', { name: 'Backup and recovery' }).waitFor();
  await page.getByText('PostgreSQL tools').waitFor();
  await page.getByText('Ready', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Create verified backup' }).click();
  await page.getByText(/was created and verified/).waitFor({ timeout: 30_000 });
  await page.screenshot({
    path: 'output/playwright/bcis-task-09-backup.png',
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Restore' }).first().click();
  await page
    .getByRole('heading', { name: 'Confirm guarded restore' })
    .waitFor();
  const restoreButton = page.getByRole('button', {
    name: 'Restore selected backup',
  });
  if (!(await restoreButton.isDisabled()))
    throw new Error('Restore became available without typed confirmation.');
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(960, 640);
  });
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => {
    globalThis.scrollTo({ left: 0, top: 0 });
    return {
      clientWidth: globalThis.document.documentElement.clientWidth,
      scrollWidth: globalThis.document.documentElement.scrollWidth,
      elements: [...globalThis.document.querySelectorAll('*')]
        .filter(
          (element) =>
            element.getBoundingClientRect().right > globalThis.innerWidth + 1,
        )
        .slice(0, 8)
        .map((element) => ({
          className: element.className,
          right: Math.round(element.getBoundingClientRect().right),
          tag: element.tagName,
        })),
    };
  });
  if (overflow.scrollWidth > overflow.clientWidth)
    throw new Error(`Compact layout overflow: ${JSON.stringify(overflow)}`);
  await restoreButton.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'output/playwright/bcis-task-09-restore-confirmation.png',
  });
  if (rendererErrors.length)
    throw new Error(`Renderer errors: ${rendererErrors.join(' | ')}`);
  process.stdout.write('Task 9 Electron flow passed.\n');
} finally {
  await application.close();
}
