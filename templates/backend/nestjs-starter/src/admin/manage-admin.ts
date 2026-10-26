import dataSource from '../database/data-source';
import { setPlatformAdmin, validateAdminCommand } from './manage-admin.service';

async function main() {
  const [operation, userId, ...extra] = process.argv.slice(2);
  validateAdminCommand(operation, userId, extra);
  await dataSource.initialize();
  try {
    await setPlatformAdmin(dataSource, operation, userId);
    // Structured operator log intentionally excludes email, tokens and database credentials.
    console.log(JSON.stringify({ event: `platform_admin.${operation}`, userId, at: new Date().toISOString() }));
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error && /^(Usage:|User not found|Only active)/.test(error.message) ? error.message : 'Administrator command failed; check database configuration and migrations.');
  process.exitCode = 1;
});
