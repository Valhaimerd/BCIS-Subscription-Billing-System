import { _electron as electron } from 'playwright';
import { config as loadEnvironment } from 'dotenv';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import process from 'node:process';

loadEnvironment({ path: resolve('.env'), quiet: true, override: true });
if (!process.env.SEED_OWNER_PASSWORD)
  throw new Error('SEED_OWNER_PASSWORD is required.');

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Could not reserve a local API port.');
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return address.port;
}

const apiPort = await reservePort();
const api = spawn(process.execPath, [resolve('apps/api/dist/server.js')], {
  cwd: process.cwd(),
  env: { ...process.env, API_PORT: String(apiPort) },
  stdio: 'ignore',
  windowsHide: true,
});
let application;

try {
  const apiReadyDeadline = Date.now() + 30_000;
  let apiReady = false;
  while (Date.now() < apiReadyDeadline && !api.exitCode) {
    try {
      const response = await globalThis.fetch(
        `http://127.0.0.1:${apiPort}/api/v1/health/ready`,
      );
      if (response.ok) {
        apiReady = true;
        break;
      }
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveWait) => globalThis.setTimeout(resolveWait, 250));
  }
  if (!apiReady)
    throw new Error('The isolated Task 10 API did not become ready.');

  await mkdir('output/playwright', { recursive: true });
  const childEnvironment = {
    ...process.env,
    BCIS_API_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1`,
  };
  delete childEnvironment.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({
    executablePath: resolve('node_modules/electron/dist/electron.exe'),
    args: [resolve('apps/desktop/out/main/index.js')],
    env: childEnvironment,
  });

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
  await page.getByRole('button', { name: 'Backup & recovery' }).click();
  await page.getByRole('heading', { name: 'Backup register' }).waitFor();
  await page.getByText('PostgreSQL tools').waitFor();
  await page
    .getByRole('button', { name: /Review restore/ })
    .first()
    .waitFor({ timeout: 30_000 });
  await page.getByText('Ready', { exact: true }).first().waitFor();
  await page.screenshot({
    path: 'output/playwright/bcis-task-10-recovery-overview.png',
    fullPage: true,
  });

  const reviewButtons = page.getByRole('button', { name: /Review restore/ });
  const candidateCount = await reviewButtons.count();
  if (!candidateCount)
    throw new Error(
      'No available backup is available for read-only preflight.',
    );

  let selectedVerifiedBackup = false;
  let lastPreflightIssue = 'No verification response was displayed.';
  for (let index = 0; index < candidateCount; index += 1) {
    await reviewButtons.nth(index).click();
    const dialog = page.getByRole('dialog', { name: /Restore from/ });
    await dialog.waitFor();
    try {
      await dialog.getByText('Backup verified', { exact: true }).waitFor({
        timeout: 8_000,
      });
      selectedVerifiedBackup = true;
      break;
    } catch {
      const alert = dialog.getByRole('alert');
      if (await alert.count()) lastPreflightIssue = await alert.innerText();
      if (index < candidateCount - 1)
        await dialog
          .getByRole('button', { name: 'Close restore review' })
          .click();
    }
  }
  if (selectedVerifiedBackup) {
    const restoreDialog = page.getByRole('dialog', { name: /Restore from/ });
    await restoreDialog.getByRole('button', { name: 'Review impact' }).click();
    await restoreDialog
      .getByRole('heading', { name: 'Record count impact' })
      .waitFor();
    await restoreDialog
      .getByText(/Restoring replaces the current database and attachments/)
      .waitFor();
    await page.screenshot({
      path: 'output/playwright/bcis-task-10-restore-impact-1440.png',
    });

    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(960, 640);
    });
    const compactLayout = await page.locator('html').evaluate((root) => ({
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
    }));
    if (compactLayout.scrollWidth > compactLayout.clientWidth)
      throw new Error(
        `Compact restore dialog overflows: ${JSON.stringify(compactLayout)}`,
      );
    await page.screenshot({
      path: 'output/playwright/bcis-task-10-restore-impact-960.png',
    });
    await restoreDialog
      .getByRole('button', { name: 'Close restore review' })
      .click();
    await restoreDialog.waitFor({ state: 'hidden' });
  } else {
    const blockedDialog = page.getByRole('dialog', { name: /Restore from/ });
    await blockedDialog.getByRole('alert').waitFor();
    await blockedDialog
      .getByRole('button', { name: 'Retry verification' })
      .waitFor();
    if (
      await blockedDialog
        .getByRole('button', { name: 'Restore and replace current data' })
        .count()
    )
      throw new Error(
        'Restore was offered after preflight rejected the backup.',
      );
    await page.screenshot({
      path: 'output/playwright/bcis-task-10-preflight-blocked.png',
    });
    await blockedDialog
      .getByRole('button', { name: 'Close restore review' })
      .click();
    await blockedDialog.waitFor({ state: 'hidden' });
    process.stdout.write(
      `Task 10 Electron safely blocked restore preflight: ${lastPreflightIssue.replaceAll(/\s+/g, ' ')}\n`,
    );
  }

  if (rendererErrors.length)
    throw new Error(`Renderer errors: ${rendererErrors.join(' | ')}`);
  process.stdout.write('No backup or restore was executed.\n');
} finally {
  if (application) await application.close();
  if (api.exitCode === null) {
    api.kill();
    await new Promise((resolveExit) => {
      if (api.exitCode !== null) resolveExit();
      else api.once('exit', resolveExit);
    });
  }
}
