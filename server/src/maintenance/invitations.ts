import type Database from 'better-sqlite3';
import { purgeTerminalBoardInvitations } from '../db/invitation-repositories';

export function startInvitationMaintenance(db: Database.Database) {
  let stopped = false;
  let immediate: ReturnType<typeof setImmediate> | null = null;
  function drain() {
    immediate = null;
    if (stopped) return;
    try {
      if (purgeTerminalBoardInvitations(db) === 1000) {
        immediate = setImmediate(drain);
        immediate.unref();
      }
    } catch {
      process.stderr.write('Invitation retention maintenance failed. Retrying next hour.\n');
    }
  }
  const timer = setInterval(() => { if (!immediate) drain(); }, 3600000);
  timer.unref();
  drain();
  return () => {
    stopped = true;
    clearInterval(timer);
    if (immediate) clearImmediate(immediate);
    immediate = null;
  };
}
