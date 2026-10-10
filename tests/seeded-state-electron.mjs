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
const packagedExecutable = process.env.BCIS_DESKTOP_EXECUTABLE;

const application = await electron.launch({
  executablePath: packagedExecutable
    ? resolve(packagedExecutable)
    : resolve('node_modules/electron/dist/electron.exe'),
  args: packagedExecutable ? [] : [resolve('apps/desktop/out/main/index.js')],
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
  try {
    await page
      .getByRole('heading', { name: 'Today' })
      .waitFor({ timeout: 15_000 });
  } catch (error) {
    await page.screenshot({
      path: 'output/playwright/bcis-seeded-login-failure.png',
    });
    const pageText = (await page.locator('body').innerText()).slice(0, 500);
    throw new Error(`Login did not reach the dashboard: ${pageText}`, {
      cause: error,
    });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  const sidebar = page.locator('.sidebar');
  async function sidebarWidth() {
    return sidebar.evaluate((element) => {
      const view = element.ownerDocument.defaultView;
      return Number.parseFloat(view.getComputedStyle(element).width);
    });
  }
  const expandSidebar = page.getByRole('button', { name: 'Expand sidebar' });
  if (await expandSidebar.count()) {
    await expandSidebar.click();
    await page.waitForTimeout(250);
  }
  const expandedWidth = await sidebarWidth();
  if (expandedWidth <= 0)
    throw new Error('The expanded sidebar has no visible width.');
  await page.screenshot({
    path: 'output/playwright/bcis-seeded-shell-expanded.png',
  });
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.locator('.sidebar-collapsed').waitFor();
  await page.waitForTimeout(250);
  const collapsedWidth = await sidebarWidth();
  const collapseRatio = collapsedWidth / expandedWidth;
  if (collapseRatio <= 0.2 || collapseRatio >= 0.5)
    throw new Error(
      `Expected a narrow collapsed rail; received width ratio ${collapseRatio} (${collapsedWidth}px / ${expandedWidth}px).`,
    );
  const collapsedHome = page.locator(
    '.sidebar-collapsed .nav-item[aria-current="page"]',
  );
  if ((await collapsedHome.getAttribute('aria-label')) !== 'Today')
    throw new Error('The collapsed sidebar lost its active Home destination.');
  await page.screenshot({
    path: 'output/playwright/bcis-seeded-shell-collapsed.png',
  });
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await page.waitForTimeout(250);
  if (Math.abs((await sidebarWidth()) - expandedWidth) > 1)
    throw new Error('Expanding the sidebar did not restore its prior width.');
  await page.setViewportSize({ width: 960, height: 640 });
  await page.screenshot({
    path: 'output/playwright/bcis-seeded-shell-minimum-size.png',
  });
  await page.setViewportSize({ width: 760, height: 900 });
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  const navigationDrawer = page.getByRole('dialog', {
    name: 'Application sidebar',
  });
  await navigationDrawer.waitFor();
  if (Math.abs((await sidebarWidth()) - expandedWidth) > 1)
    throw new Error('The compact navigation drawer did not use the full rail.');
  await navigationDrawer
    .getByRole('button', { name: 'Close navigation' })
    .waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-seeded-navigation-drawer.png',
  });
  await page.keyboard.press('Escape');
  await navigationDrawer.waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByRole('button', { name: 'Subscribers', exact: true }).click();
  await page.getByRole('heading', { name: 'Find a subscriber' }).waitFor();
  const firstSubscriber = page
    .getByRole('button', { name: /Open profile for/ })
    .first();
  await firstSubscriber.waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-subscriber-cards.png',
  });
  await firstSubscriber.click();
  await page.getByRole('tab', { name: 'Overview' }).waitFor();
  await page.getByRole('tab', { name: /Services/ }).click();
  await page.getByRole('button', { name: 'Add service' }).click();
  await page.getByRole('heading', { name: 'Add a service' }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'output/playwright/bcis-service-wizard.png' });
  await page.setViewportSize({ width: 960, height: 640 });
  if (
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth >
        globalThis.window.innerWidth + 1,
    )
  )
    throw new Error('Service wizard overflows horizontally at 960×640.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel('Service number').fill('SVC-UNSAVED');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await page.getByRole('button', { name: '← Back to subscribers' }).click();
  await page.getByRole('button', { name: 'Register subscriber' }).click();
  await page.getByRole('heading', { name: 'Register an account' }).waitFor();
  await page.waitForTimeout(350);
  await page.screenshot({
    path: 'output/playwright/bcis-subscriber-wizard.png',
  });
  await page.setViewportSize({ width: 960, height: 640 });
  if (
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth >
        globalThis.window.innerWidth + 1,
    )
  )
    throw new Error('Subscriber wizard overflows horizontally at 960×640.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel('Subscriber number').fill('SUB-UNSAVED');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.screenshot({ path: 'output/playwright/bcis-subscriber-exit.png' });
  await page.getByRole('button', { name: 'Discard changes' }).click();

  await page.getByRole('button', { name: 'Payments' }).click();
  await page.getByRole('heading', { name: 'Receive a payment' }).waitFor();
  await page
    .getByRole('searchbox', { name: 'Subscriber or account number' })
    .fill('Maria');
  await page.getByRole('button', { name: 'Find account' }).click();
  await page
    .getByRole('button', { name: /Maria Santos/ })
    .first()
    .click();
  await page.getByLabel('Amount received (PHP)').fill('1.00');
  await page.getByRole('button', { name: 'Review payment →' }).click();
  await page.getByRole('heading', { name: 'Confirm before posting' }).waitFor();
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'output/playwright/bcis-payment-review.png' });
  await page.setViewportSize({ width: 960, height: 640 });
  if (
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth >
        globalThis.window.innerWidth + 1,
    )
  )
    throw new Error(
      'Payment review overflows horizontally at the minimum desktop size.',
    );
  await page.screenshot({
    path: 'output/playwright/bcis-payment-review-minimum-size.png',
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Edit details' }).click();

  await page.getByRole('button', { name: 'Plans' }).click();
  await page.getByRole('heading', { name: 'Service plans' }).waitFor();
  await page.screenshot({ path: 'output/playwright/bcis-plan-cards.png' });
  await page.getByRole('button', { name: 'Add service plan' }).click();
  await page.getByRole('heading', { name: 'Add a service plan' }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'output/playwright/bcis-plan-wizard.png' });
  await page.setViewportSize({ width: 960, height: 640 });
  if (
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth >
        globalThis.window.innerWidth + 1,
    )
  )
    throw new Error('Plan wizard overflows horizontally at 960×640.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'View plan' }).first().click();
  await page.getByRole('dialog', { name: 'Plan details' }).waitFor();
  await page.screenshot({ path: 'output/playwright/bcis-plan-detail.png' });
  await page.getByRole('button', { name: 'Change price' }).click();
  const planPriceDialog = page.getByRole('dialog', {
    name: 'Change plan price',
  });
  await planPriceDialog.waitFor();
  await planPriceDialog.getByLabel('New monthly price (PHP)').fill('850.00');
  await planPriceDialog
    .getByLabel('Reason for price change')
    .fill('Approved annual rate review');
  await planPriceDialog.getByRole('button', { name: 'Review change' }).click();
  await planPriceDialog
    .getByRole('button', { name: 'Save new price' })
    .waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-seeded-plan-price-dialog.png',
  });
  await page.setViewportSize({ width: 960, height: 640 });
  if (
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth >
        globalThis.window.innerWidth + 1,
    )
  )
    throw new Error('Plan price review overflows horizontally at 960×640.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await planPriceDialog.getByRole('button', { name: '← Edit details' }).click();
  await planPriceDialog.getByRole('button', { name: 'Cancel' }).click();
  await planPriceDialog.waitFor({ state: 'hidden' });

  await page.getByRole('button', { name: 'Billing' }).click();
  await page.getByRole('heading', { name: 'Billing months' }).waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-seeded-billing-desk.png',
  });
  await page.getByRole('button', { name: 'Open register' }).click();
  await page.locator('tbody .record-link').first().click();
  const invoiceDialog = page.getByLabel('Invoice detail');
  await invoiceDialog.waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-seeded-invoice-modal.png',
  });
  const adjustmentButton = invoiceDialog.getByRole('button', {
    name: 'Adjustment',
  });
  if (await adjustmentButton.isVisible()) {
    await adjustmentButton.click();
    const adjustmentDialog = page.getByRole('dialog', {
      name: 'Invoice adjustment',
    });
    await adjustmentDialog.waitFor();
    await page.screenshot({
      path: 'output/playwright/bcis-seeded-adjustment-dialog.png',
    });
    await adjustmentDialog.getByRole('button', { name: 'Cancel' }).click();
    await adjustmentDialog.waitFor({ state: 'hidden' });
  }
  const voidButton = invoiceDialog.getByRole('button', { name: 'Void' });
  if (await voidButton.isVisible()) {
    await voidButton.click();
    const voidDialog = page.getByRole('dialog', { name: 'Void invoice' });
    await voidDialog.waitFor();
    await page.screenshot({
      path: 'output/playwright/bcis-seeded-void-dialog.png',
    });
    await voidDialog.getByRole('button', { name: 'Cancel' }).click();
    await voidDialog.waitFor({ state: 'hidden' });
  }
  await invoiceDialog.getByRole('button', { name: 'Close' }).click();
  await invoiceDialog.waitFor({ state: 'hidden' });

  await page.getByRole('button', { name: 'Payments' }).click();
  await page.getByRole('tab', { name: 'Payment history' }).click();
  const paymentRows = page.locator('tbody .record-link');
  await paymentRows.first().waitFor();
  const paymentCount = await paymentRows.count();
  if (paymentCount < 20)
    throw new Error(
      `Expected a populated payment history; found ${paymentCount}.`,
    );
  await page
    .getByText('PENDING VERIFICATION', { exact: true })
    .first()
    .waitFor();
  await page.getByText('REJECTED', { exact: true }).first().waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-seeded-payment-history.png',
  });

  const postedPayment = page
    .locator('tbody tr')
    .filter({ hasText: 'POSTED' })
    .first();
  if (await postedPayment.count()) {
    await postedPayment.locator('.record-link').click();
    const receiptDialog = page.getByLabel('Receipt detail');
    await receiptDialog.waitFor();
    await page.screenshot({
      path: 'output/playwright/bcis-seeded-receipt-modal.png',
    });
    const reverseButton = receiptDialog.getByRole('button', {
      name: 'Reverse',
    });
    if (await reverseButton.isVisible()) {
      await reverseButton.click();
      const reversalDialog = page.getByRole('dialog', {
        name: 'Reverse payment',
      });
      await reversalDialog.waitFor();
      await page.screenshot({
        path: 'output/playwright/bcis-seeded-reversal-dialog.png',
      });
      await reversalDialog.getByRole('button', { name: 'Cancel' }).click();
      await reversalDialog.waitFor({ state: 'hidden' });
    }
    await page.keyboard.press('Escape');
    await receiptDialog.waitFor({ state: 'hidden' });
  }

  await page.getByRole('tab', { name: 'GCash verification' }).click();
  const pendingPayment = page
    .locator('tbody tr')
    .filter({ hasText: 'PENDING VERIFICATION' })
    .first();
  await pendingPayment.locator('.record-link').click();
  const proofImage = page.locator('.proof-panel img');
  let rejectionDialogChecked = false;
  let proofRendered = false;
  try {
    await proofImage.waitFor({ timeout: 5_000 });
    proofRendered = true;
  } catch {
    await page.screenshot({
      path: 'output/playwright/bcis-seeded-gcash-proof-unavailable.png',
    });
  }
  if (proofRendered) {
    await page.getByRole('button', { name: 'Reject' }).click();
    const rejectionDialog = page.getByRole('dialog', {
      name: 'Reject GCash proof',
    });
    await rejectionDialog.waitFor();
    await page.screenshot({
      path: 'output/playwright/bcis-seeded-rejection-dialog.png',
    });
    await rejectionDialog.getByRole('button', { name: 'Cancel' }).click();
    await rejectionDialog.waitFor({ state: 'hidden' });
    rejectionDialogChecked = true;
  }

  await page.getByRole('button', { name: 'Collections' }).click();
  await page.getByRole('heading', { name: 'Collection batches' }).waitFor();
  await page.locator('tbody .record-link').first().click();
  const collectionDialog = page.getByLabel('Collection batch detail');
  await collectionDialog.waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-seeded-collection-modal.png',
  });
  for (const actionName of [
    'Confirm reconciliation',
    'Confirm and close batch',
  ]) {
    const actionButton = collectionDialog.getByRole('button', {
      name: actionName,
    });
    if (await actionButton.isVisible()) {
      await actionButton.click();
      const confirmDialog = page.getByRole('dialog', {
        name:
          actionName === 'Confirm reconciliation'
            ? 'Confirm reconciliation'
            : 'Close collection batch',
      });
      await confirmDialog.waitFor();
      await page.screenshot({
        path: `output/playwright/bcis-seeded-${actionName === 'Confirm reconciliation' ? 'reconciliation' : 'batch-close'}-dialog.png`,
      });
      await confirmDialog.getByRole('button', { name: 'Cancel' }).click();
      await confirmDialog.waitFor({ state: 'hidden' });
    }
  }
  await page.mouse.click(20, 20);
  await collectionDialog.waitFor({ state: 'hidden' });
  let reconciliationDialogChecked = false;
  const remittedBatch = page
    .locator('tbody tr')
    .filter({ hasText: 'REMITTED' })
    .first();
  if (await remittedBatch.count()) {
    await remittedBatch.locator('.record-link').click();
    const remittedDialog = page.getByLabel('Collection batch detail');
    await remittedDialog.waitFor();
    await remittedDialog
      .getByRole('button', { name: 'Confirm reconciliation' })
      .click();
    const reconcileConfirmation = page.getByRole('dialog', {
      name: 'Confirm reconciliation',
    });
    await reconcileConfirmation.waitFor();
    await page.screenshot({
      path: 'output/playwright/bcis-seeded-reconciliation-dialog.png',
    });
    await reconcileConfirmation.getByRole('button', { name: 'Cancel' }).click();
    await reconcileConfirmation.waitFor({ state: 'hidden' });
    reconciliationDialogChecked = true;
    await remittedDialog.getByRole('button', { name: 'Close' }).click();
  }
  let batchCloseDialogChecked = false;
  const reconciledBatch = page
    .locator('tbody tr')
    .filter({ hasText: 'RECONCILED' })
    .first();
  if (await reconciledBatch.count()) {
    await reconciledBatch.locator('.record-link').click();
    const reconciledDialog = page.getByLabel('Collection batch detail');
    await reconciledDialog.waitFor();
    await reconciledDialog
      .getByRole('button', { name: 'Confirm and close batch' })
      .click();
    const closeConfirmation = page.getByRole('dialog', {
      name: 'Close collection batch',
    });
    await closeConfirmation.waitFor();
    await page.screenshot({
      path: 'output/playwright/bcis-seeded-batch-close-dialog.png',
    });
    await closeConfirmation.getByRole('button', { name: 'Cancel' }).click();
    await closeConfirmation.waitFor({ state: 'hidden' });
    batchCloseDialogChecked = true;
    await reconciledDialog.getByRole('button', { name: 'Close' }).click();
  }

  await page.getByRole('button', { name: 'Receivables' }).click();
  await page.getByRole('heading', { name: 'Accounts receivable' }).waitFor();
  await page.getByText('Total receivables').waitFor();
  await page.locator('tbody .record-link').first().waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-seeded-receivables-workspace.png',
    fullPage: true,
  });
  await page.locator('tbody .record-link').first().click();
  const receivableDialog = page.getByLabel('Receivable service control detail');
  await receivableDialog.waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-seeded-receivable-modal.png',
  });
  await page.getByRole('button', { name: 'Close' }).click();
  await receivableDialog.waitFor({ state: 'hidden' });

  const roleChecks = [
    {
      username: 'cashier',
      visible: ['Today', 'Subscribers', 'Plans', 'Billing', 'Payments'],
      hidden: [
        'Collections',
        'Receivables',
        'Services',
        'Reports',
        'Backup & recovery',
      ],
    },
    {
      username: 'auditor',
      visible: [
        'Today',
        'Billing',
        'Payments',
        'Collections',
        'Receivables',
        'Reports',
      ],
      hidden: ['Subscribers', 'Plans', 'Services', 'Backup & recovery'],
    },
    {
      username: 'technician',
      visible: ['Today', 'Subscribers', 'Plans', 'Services'],
      hidden: [
        'Billing',
        'Payments',
        'Collections',
        'Receivables',
        'Reports',
        'Backup & recovery',
      ],
    },
  ];
  for (const role of roleChecks) {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('heading', { name: 'Sign in to BCIS' }).waitFor();
    await page.getByLabel('Username').fill(role.username);
    await page
      .locator('input[name="password"]')
      .fill(process.env.SEED_OWNER_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('heading', { name: 'Today' }).waitFor();
    for (const destination of role.visible) {
      if (
        !(await page
          .getByRole('button', { name: destination, exact: true })
          .count())
      )
        throw new Error(
          `${role.username} is missing permitted ${destination} navigation.`,
        );
    }
    for (const destination of role.hidden) {
      if (
        await page
          .getByRole('button', { name: destination, exact: true })
          .count()
      )
        throw new Error(
          `${role.username} can see unauthorized ${destination} navigation.`,
        );
    }
    if (role.visible.includes('Plans')) {
      await page.getByRole('button', { name: 'Plans' }).click();
      await page.getByRole('heading', { name: 'Service plans' }).waitFor();
      if (await page.getByRole('button', { name: 'Add service plan' }).count())
        throw new Error(`${role.username} can see plan management actions.`);
      await page.getByRole('button', { name: 'View plan' }).first().click();
      if (await page.getByRole('button', { name: 'Change price' }).count())
        throw new Error(`${role.username} can change plan prices.`);
      await page.getByRole('button', { name: 'Close' }).click();
    }
  }

  if (rendererErrors.length)
    throw new Error(`Renderer errors: ${rendererErrors.join(' | ')}`);
  process.stdout.write(
    `Seeded-state Electron flow passed with ${paymentCount} payment records${rejectionDialogChecked ? '' : '; GCash rejection dialog skipped because no proof image rendered for the seeded pending payment'}${reconciliationDialogChecked ? '' : '; reconciliation dialog skipped because no remitted batch was seeded'}${batchCloseDialogChecked ? '' : '; batch close dialog skipped because no reconciled batch was seeded'}.\n`,
  );
} finally {
  await application.close();
}
