const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

async function prepareDatabase() {
  const runtimeUrl = new URL(process.env.APP_DATABASE_URL);
  const role = 'eventflow_preview_app';
  const password = decodeURIComponent(runtimeUrl.password);
  if (runtimeUrl.username !== role || !/^[a-f0-9]{64}$/.test(password)) {
    throw new Error('Invalid preview database configuration');
  }

  const migration = spawnSync('pnpm', ['run', 'prisma:deploy'], { stdio: 'inherit' });
  if (migration.status !== 0) throw new Error('Database migration failed');

  const db = new PrismaClient();
  try {
    await db.$executeRawUnsafe(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${role}') THEN
        CREATE ROLE ${role} LOGIN;
      END IF;
    END $$;`);
    await db.$executeRawUnsafe(`ALTER ROLE ${role} WITH LOGIN PASSWORD '${password}'`);
    await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await db.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
    await db.$executeRawUnsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
    await db.$executeRawUnsafe(`REVOKE ALL ON TABLE public._prisma_migrations FROM ${role}`);
    await db.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`);
    await db.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${role}`);
    console.log('Preview database migration and application privileges are ready.');
  } finally {
    await db.$disconnect();
  }
}

prepareDatabase().catch(() => {
  console.error('Preview database preparation failed.');
  process.exitCode = 1;
});
