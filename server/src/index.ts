import { getDatabase } from './db/database';
import { createApp } from './app';
import { startAutomationRunner } from './automation/runner';

const port = Number(process.env.STRATA_PORT ?? process.env.PORT ?? 8787);
const automationRunnerIntervalMs = Number(process.env.STRATA_AUTOMATION_RUNNER_INTERVAL_MS ?? 5000);

async function main() {
  const db = await getDatabase();
  const app = createApp(db);
  startAutomationRunner(db, automationRunnerIntervalMs);
  app.listen(port, () => {
    process.stdout.write(`Strata API listening on http://localhost:${port}\n`);
  });
}

void main();
