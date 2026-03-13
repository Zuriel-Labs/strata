import { getDatabase } from './db/database';
import { createApp } from './app';

const port = Number(process.env.STRATA_PORT ?? 8787);

async function main() {
  const db = await getDatabase();
  const app = createApp(db);
  app.listen(port, () => {
    process.stdout.write(`Strata API listening on http://localhost:${port}\n`);
  });
}

void main();
