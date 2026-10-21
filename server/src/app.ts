import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import type Database from 'better-sqlite3';
import { attachAuth } from './http/auth-middleware';
import { createAuthRoutes } from './routes/auth-routes';
import { createNavigationRoutes } from './routes/navigation-routes';
import { createAdminRoutes } from './routes/admin-routes';
import { createAdminInvitationRoutes, createRecipientInvitationRoutes } from './routes/invitation-routes';
import { createBootstrapRoutes } from './routes/bootstrap-routes';
import { createBoardRoutes } from './routes/board-routes';
import { createListRoutes } from './routes/list-routes';
import { createCardRoutes } from './routes/card-routes';
import { createAutomationRoutes, createNotificationRoutes } from './routes/automation-routes';
import { guardLifecycleWrites } from './http/lifecycle-middleware';
import { createLifecycleRoutes } from './routes/lifecycle-routes';
import { createContentOperationRoutes } from './routes/content-operation-routes';
import { createPresentationRoutes } from './routes/presentation-routes';

const JSON_BODY_LIMIT = '12mb';

export function createApp(db: Database.Database) {
  const app = express();
  const clientDistPath = path.resolve(process.cwd(), 'dist');
  const clientIndexPath = path.join(clientDistPath, 'index.html');
  const hasClientBuild = fs.existsSync(clientIndexPath);

  // Trust the first reverse proxy (Traefik/ingress) so Express respects
  // X-Forwarded-Proto and X-Forwarded-For headers. Required for secure
  // cookies and correct req.secure values behind TLS termination.
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }));

  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());
  app.use(attachAuth(db));
  app.use(guardLifecycleWrites(db));
  app.use('/api', createLifecycleRoutes(db));
  app.use('/api/content-operations', createContentOperationRoutes(db));
  app.use('/api', createPresentationRoutes(db));

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true });
  });

  app.use('/api/auth', createAuthRoutes(db));
  app.use('/api/auth/navigation', createNavigationRoutes(db));
  app.use('/api/auth', createRecipientInvitationRoutes(db));
  app.use('/api/admin', createAdminRoutes(db));
  app.use('/api/admin', createAdminInvitationRoutes(db));
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

    if (typeof error === 'object' && error && 'type' in error && error.type === 'entity.too.large') {
      response.status(413).json({
        message: 'Request payload is too large.',
      });
      return;
    }

    // In production, return generic messages for unknown errors to avoid
    // leaking internal details (database errors, file paths, etc.)
    const isProduction = process.env.NODE_ENV === 'production';
    const isKnownSafeError = typeof error === 'object' && error !== null && (
      'constructor' in error && (
        error.constructor?.name === 'ZodError' ||
        error.constructor?.name === 'AuthError' ||
        error.constructor?.name === 'ValidationError'
      )
    );

    if (isProduction && !isKnownSafeError) {
      response.status(500).json({
        message: 'An unexpected error occurred.',
      });
      return;
    }

    response.status(500).json({
      message: error instanceof Error ? error.message : 'Unexpected server error.',
    });
  });

  return app;
}
