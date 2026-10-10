import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

import { config as loadEnvironment } from 'dotenv';

loadEnvironment({ path: resolve('.env'), quiet: true });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
if (process.env.NODE_ENV === 'production')
  throw new Error('The lab database reset cannot run in production.');

const databaseUrl = new URL(process.env.DATABASE_URL);
const databaseName = databaseUrl.pathname.slice(1);
if (
  !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname) ||
  !/^bcis(?:_[a-z0-9_]+)?$/i.test(databaseName)
)
  throw new Error('The lab reset is restricted to a local BCIS database.');

const postgresBin = process.env.POSTGRES_BIN_DIRECTORY;
const executable = (name) =>
  postgresBin ? join(postgresBin, `${name}.exe`) : `${name}.exe`;
for (const tool of ['pg_dump', 'pg_restore', 'psql']) {
  if (postgresBin && !existsSync(executable(tool)))
    throw new Error(`PostgreSQL tool is unavailable: ${executable(tool)}`);
}

const backupDirectory = resolve(
  process.env.BACKUP_DIRECTORY ?? './storage/backups',
);
await mkdir(backupDirectory, { recursive: true });
const stamp = new Date().toISOString().replaceAll(/\D/g, '');
const backupPath = join(backupDirectory, `pre-reset-${stamp}.dump`);
const connectionArguments = [
  '--host',
  databaseUrl.hostname,
  '--port',
  databaseUrl.port || '5432',
  '--username',
  decodeURIComponent(databaseUrl.username),
  '--dbname',
  databaseName,
];
const commandEnvironment = {
  ...process.env,
  PGPASSWORD: decodeURIComponent(databaseUrl.password),
};

function run(program, arguments_, label, environment = process.env) {
  const result = spawnSync(program, arguments_, {
    cwd: resolve('.'),
    env: environment,
    encoding: 'utf8',
    shell: false,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed.`);
}

run(
  executable('pg_dump'),
  ['--format=custom', '--file', backupPath, ...connectionArguments],
  'Safety backup',
  commandEnvironment,
);

let resetStarted = false;
try {
  resetStarted = true;
  run(
    executable('psql'),
    [
      ...connectionArguments,
      '--set',
      'ON_ERROR_STOP=1',
      '--command',
      'drop schema if exists drizzle cascade; drop schema public cascade; create schema public; grant all on schema public to current_user;',
    ],
    'Schema reset',
    commandEnvironment,
  );
  const npmCli = process.env.npm_execpath;
  const npmProgram = npmCli ? process.execPath : 'npm';
  const npmArguments = (arguments_) =>
    npmCli ? [npmCli, ...arguments_] : arguments_;
  run(npmProgram, npmArguments(['run', 'db:migrate']), 'Database migration');
  run(npmProgram, npmArguments(['run', 'db:seed']), 'Database seed');
} catch (error) {
  if (resetStarted)
    run(
      executable('pg_restore'),
      [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        ...connectionArguments,
        backupPath,
      ],
      'Safety restore',
      commandEnvironment,
    );
  throw error;
}

process.stdout.write(
  `Local ${databaseName} database reset and seeded. Safety backup: ${backupPath}\n`,
);
