import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import type Database from 'better-sqlite3';
import { attachAuth } from './http/auth-middleware';
import { createAuthRoutes } from './routes/auth-routes';
import { createAdminRoutes } from './routes/admin-routes';
import { createBootstrapRoutes } from './routes/bootstrap-routes';
import { createBoardRoutes } from './routes/board-routes';
import { createListRoutes } from './routes/list-routes';
import { createCardRoutes } from './routes/card-routes';
import { createAutomationRoutes, createNotificationRoutes } from './routes/automation-routes';

export function createApp(db: Database.Database) {
  const app = express();
  const clientDistPath = path.resolve(process.cwd(), 'dist');
  const clientIndexPath = path.join(clientDistPath, 'index.html');
  const hasClientBuild = fs.existsSync(clientIndexPath);

  app.use(express.json());
  app.use(cookieParser());
  app.use(attachAuth(db));

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true });
  });

  app.use('/api/auth', createAuthRoutes(db));
  app.use('/api/admin', createAdminRoutes(db));
  app.use('/api/workspaces', createBootstrapRoutes(db));
  app.use('/api/boards', createBoardRoutes(db));
  app.use('/api/lists', createListRoutes(db));
  app.use('/api/cards', createCardRoutes(db));
  app.use('/api/automation-rules', createAutomationRoutes(db));
  app.use('/api/notifications', createNotificationRoutes(db));

  if (hasClientBuild) {
    app.use(express.static(clientDistPath, { index: false }));

    app.use((request, response, next) => {
      if ((request.method !== 'GET' && request.method !== 'HEAD') || request.path === '/api' || request.path.startsWith('/api/')) {
        next();
        return;
      }

      if (!request.accepts('html') || path.extname(request.path)) {
        next();
        return;
      }

      response.sendFile(clientIndexPath);
    });
  }

  app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
    void next;
    response.status(500).json({
      message: error instanceof Error ? error.message : 'Unexpected server error.',
    });
  });

  return app;
}
