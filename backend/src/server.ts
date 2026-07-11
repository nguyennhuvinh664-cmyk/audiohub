import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { startMaintenanceCron } from './modules/maintenance/maintenance.routes.js';

async function connectWithRetry(maxRetries = 5, delayMs = 10000) {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      await prisma.$connect();
      console.log(`[audiohub-backend] Database connected on attempt ${i}`);
      return;
    } catch (err) {
      console.error(`[audiohub-backend] DB connection attempt ${i}/${maxRetries} failed, retrying in ${delayMs / 1000}s...`);
      if (i < maxRetries) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error('Failed to connect to database after ' + maxRetries + ' attempts');
}

async function bootstrap() {
  await connectWithRetry();

  // Run migrations after DB is connected (skip if DISABLE_PRISMA_MIGRATE is set)
  if (!process.env.DISABLE_PRISMA_MIGRATE) {
    try {
      const { execSync } = await import('child_process');
      execSync('npx prisma migrate deploy', { stdio: 'inherit', timeout: 60000 });
      console.log('[audiohub-backend] Migrations applied');
    } catch (err) {
      console.error('[audiohub-backend] Migration failed (non-fatal):', err);
    }
  } else {
    console.log('[audiohub-backend] Skipping migrations (DISABLE_PRISMA_MIGRATE)');
  }

  startMaintenanceCron();

  app.listen(env.PORT, function () {
    console.log(`[audiohub-backend] listening on http://localhost:${env.PORT}`);
  });
}

bootstrap().catch(function (error) {
  console.error('[audiohub-backend] failed to start', error);
  process.exit(1);
});
