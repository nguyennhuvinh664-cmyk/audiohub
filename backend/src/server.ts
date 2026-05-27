import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { startMaintenanceCron } from './modules/maintenance/maintenance.routes.js';

async function bootstrap() {
  await prisma.$connect();
  startMaintenanceCron();

  app.listen(env.PORT, function () {
    console.log(`[audiohub-backend] listening on http://localhost:${env.PORT}`);
  });
}

bootstrap().catch(function (error) {
  console.error('[audiohub-backend] failed to start', error);
  process.exit(1);
});
