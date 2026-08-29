import { env } from '../../shared/config/env.js';
import { outlookGraphService } from './outlook-graph.service.js';

let timer: NodeJS.Timeout | undefined;

export function startOutlookSyncScheduler() {
  if (timer || !outlookGraphService.isConfigured()) return;
  timer = setInterval(() => void outlookGraphService.syncAll(), env.OUTLOOK_SYNC_INTERVAL_MINUTES * 60_000);
  timer.unref();
}

export function stopOutlookSyncScheduler() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
