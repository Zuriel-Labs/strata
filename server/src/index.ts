import { getDatabase } from './db/database';
import { createApp } from './app';
import { startAutomationRunner } from './automation/runner';

const port = Number(process.env.STRATA_PORT ?? process.env.PORT ?? 8787);

async function main() {
  const db = await getDatabase();
  const app = createApp(db);
  startAutomationRunner(db);
  app.listen(port, () => {
    process.stdout.write(`Strata API listening on http://localhost:${port}\n`);
  });
}

void main();
