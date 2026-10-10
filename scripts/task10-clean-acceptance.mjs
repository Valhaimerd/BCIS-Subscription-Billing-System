import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

import { config as loadEnvironment } from 'dotenv';
import pg from 'pg';

loadEnvironment({ path: resolve('.env'), quiet: true });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
if (process.env.NODE_ENV === 'production')
  throw new Error('The clean acceptance harness cannot run in production.');

const sourceUrl = new URL(process.env.DATABASE_URL);
const sourceDatabase = sourceUrl.pathname.slice(1);
if (
  !['127.0.0.1', 'localhost'].includes(sourceUrl.hostname) ||
  !/^bcis(?:_[a-z0-9_]+)?$/i.test(sourceDatabase)
)
  throw new Error('Clean acceptance is restricted to a local BCIS database.');

const stamp = new Date().toISOString().replaceAll(/\D/g, '');
const temporaryDatabase = `bcis_task10_clean_${stamp}`;
const temporaryUrl = new URL(sourceUrl);
temporaryUrl.pathname = `/${temporaryDatabase}`;
const administrationUrl = new URL(sourceUrl);
administrationUrl.pathname = '/postgres';
const evidenceDirectory = resolve('evidence/task10');
const backupDirectory = resolve(
  process.env.BACKUP_DIRECTORY ?? './storage/backups',
);
const safetyBackup = join(backupDirectory, `task10-safety-${stamp}.dump`);
const postgresBin = process.env.POSTGRES_BIN_DIRECTORY;
const executable = (name) =>
  postgresBin ? join(postgresBin, `${name}.exe`) : `${name}.exe`;
const commands = [
  ['npm', 'run', 'db:migrate'],
  ['npm', 'run', 'db:seed'],
  ['npm', 'run', 'db:seed'],
  ['npm', 'run', 'verify:task3', '--workspace', '@bcis/api'],
  ['npm', 'run', 'verify:task4'],
  ['npm', 'run', 'verify:task5'],
  ['npm', 'run', 'verify:task6'],
  ['npm', 'run', 'verify:task7'],
  ['npm', 'run', 'verify:task8'],
  ['npm', 'run', 'verify:task9'],
  ['npm', 'run', 'verify:task10'],
];
const logLines = [];
const { Client } = pg;
const administrator = new Client({ connectionString: administrationUrl.href });
let isolation = 'temporary-database';
let targetUrl = temporaryUrl.href;
let temporaryCreated = false;
let sourceReset = false;
let restored = false;
let failure;

function run(program, arguments_, options = {}) {
  const npmCli = process.env.npm_execpath;
  const command = program === 'npm' && npmCli ? process.execPath : program;
  const commandArguments =
    program === 'npm' && npmCli ? [npmCli, ...arguments_] : arguments_;
  const result = spawnSync(command, commandArguments, {
    cwd: resolve('.'),
    encoding: 'utf8',
    shell: false,
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

function runDatabaseTool(program, arguments_, label) {
  const result = run(program, arguments_, { env: process.env });
  logLines.push(
    `## ${label}\nexit: ${String(result.status)}\n${result.stdout}${result.stderr}`,
  );
  if (result.status !== 0) throw new Error(`${label} failed.`);
}

try {
  await mkdir(evidenceDirectory, { recursive: true });
  await mkdir(backupDirectory, { recursive: true });
  await administrator.connect();

  try {
    await administrator.query(`create database "${temporaryDatabase}"`);
    temporaryCreated = true;
  } catch (error) {
    if (!(error && typeof error === 'object' && error.code === '42501'))
      throw error;
    isolation = 'safety-backup-reset-restore';
    targetUrl = sourceUrl.href;
    for (const tool of ['pg_dump', 'pg_restore', 'psql']) {
      const path = executable(tool);
      if (postgresBin && !existsSync(path))
        throw new Error(`PostgreSQL tool is unavailable: ${path}`, {
          cause: error,
        });
    }
    runDatabaseTool(
      executable('pg_dump'),
      ['--format=custom', '--file', safetyBackup, sourceUrl.href],
      'Create pre-test safety backup',
    );
    sourceReset = true;
    runDatabaseTool(
      executable('psql'),
      [
        sourceUrl.href,
        '--set',
        'ON_ERROR_STOP=1',
        '--command',
        'drop schema if exists drizzle cascade; drop schema public cascade; create schema public; grant all on schema public to current_user;',
      ],
      'Reset local BCIS schemas',
    );
  }

  for (const command of commands) {
    const [program, ...arguments_] = command;
    const startedAt = new Date().toISOString();
    const result = run(program, arguments_, {
      env: { ...process.env, DATABASE_URL: targetUrl },
    });
    logLines.push(
      `## ${command.join(' ')}\nstarted: ${startedAt}\nexit: ${String(result.status)}\n${result.stdout}${result.stderr}`,
    );
    if (result.status !== 0)
      throw new Error(`Clean acceptance command failed: ${command.join(' ')}`);
  }
} catch (error) {
  failure = error;
} finally {
  try {
    if (temporaryCreated) {
      await administrator.query(
        'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
        [temporaryDatabase],
      );
      await administrator.query(`drop database "${temporaryDatabase}"`);
      restored = true;
    } else if (sourceReset) {
      runDatabaseTool(
        executable('pg_restore'),
        [
          '--clean',
          '--if-exists',
          '--no-owner',
          '--no-privileges',
          '--dbname',
          sourceUrl.href,
          safetyBackup,
        ],
        'Restore pre-test safety backup',
      );
      restored = true;
    }
  } catch (cleanupError) {
    failure ??= cleanupError;
  }
  await administrator.end();
  await writeFile(
    resolve(evidenceDirectory, 'clean-acceptance.log'),
    `${logLines.join('\n\n')}\n`,
  );
}

await writeFile(
  resolve(evidenceDirectory, 'clean-acceptance.json'),
  `${JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      database: sourceDatabase,
      isolation,
      safetyBackup:
        isolation === 'safety-backup-reset-restore'
          ? basename(safetyBackup)
          : null,
      originalStateRestored: restored,
      passed: !failure && restored,
      commands: commands.map((command) => command.join(' ')),
    },
    null,
    2,
  )}\n`,
);

if (failure) throw failure;
process.stdout.write(
  `Task 10 clean-database acceptance passed with ${commands.length} commands; original state restored.\n`,
);
