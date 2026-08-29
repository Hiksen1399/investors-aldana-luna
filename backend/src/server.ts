import { app } from './app.js';
import { env } from './shared/config/env.js';
import { prisma } from './shared/database/prisma.js';
import { startOutlookSyncScheduler, stopOutlookSyncScheduler } from './modules/imports/outlook-sync.scheduler.js';

const server = app.listen(env.PORT, () => {
  console.log(`Mi Portafolio API disponible en http://localhost:${env.PORT}/api`);
  console.log(`Documentación en http://localhost:${env.PORT}/api/docs`);
});
startOutlookSyncScheduler();

async function shutdown(signal: string) {
  console.log(`${signal}: cerrando el servidor...`);
  stopOutlookSyncScheduler();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
