import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import type Database from 'better-sqlite3';
import { createApiDocumentationRoutes } from './api/documentation';
import { createOAuthRoutes } from './api/oauth-routes';
import { attachApiPrincipal, normalizeApiErrors } from './api/middleware';
import { createApiReadRoutes } from './api/read-routes';
import { createConnectionRoutes } from './api/connection-routes';
import { rateLimit, requireTls } from './api/rate-limit';
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
  app.use(createApiDocumentationRoutes());
  app.use('/api/oauth', createOAuthRoutes(db));
  app.use('/api/connections', createConnectionRoutes(db));
  app.use('/api/v1', normalizeApiErrors, requireTls, rateLimit(db, 'api-requests', 600), attachApiPrincipal(db));
  app.use(guardLifecycleWrites(db));
  const domain = express.Router();
  domain.use('/', createLifecycleRoutes(db));
  domain.use('/content-operations', createContentOperationRoutes(db));
  domain.use('/', createPresentationRoutes(db));

  domain.use('/auth', createAuthRoutes(db));
  domain.use('/auth/navigation', createNavigationRoutes(db));
  domain.use('/auth', createRecipientInvitationRoutes(db));
  domain.use('/admin', createAdminRoutes(db));
  domain.use('/admin', createAdminInvitationRoutes(db));
  domain.use('/workspaces', createBootstrapRoutes(db));
  domain.use('/boards', createBoardRoutes(db));
  domain.use('/lists', createListRoutes(db));
  domain.use('/cards', createCardRoutes(db));
  domain.use('/automation-rules', createAutomationRoutes(db));
  domain.use('/notifications', createNotificationRoutes(db));

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true });
  });

  app.use('/api/v1', createApiReadRoutes(db), domain);
  app.use('/api', (request, response, next) => {
    if (request.get('Authorization')) { response.status(401).json({ code: 'SUPPORTED_API_REQUIRED', message: 'Send API credentials only to /api/v1.' }); return; }
    next();
  });
  app.use('/api', domain);

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

  app.use((error: unknown, request: express.Request, response: express.Response, next: express.NextFunction) => {
    void next;

    if (request.path.startsWith('/api/')) response.set('Cache-Control', 'no-store');
    if (typeof error === 'object' && error && 'type' in error && error.type === 'entity.parse.failed') {
      response.status(400).json({ code: 'INPUT_INVALID', error: 'invalid_request', message: 'Invalid request body.' });
      return;
    }

    if (typeof error === 'object' && error && 'type' in error && error.type === 'entity.too.large') {
      response.status(413).json({
        code: 'PAYLOAD_TOO_LARGE', message: 'Request payload is too large.',
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

    if ((request.path.startsWith('/api/v1') || request.path.startsWith('/api/oauth') || request.path.startsWith('/api/connections')) || (isProduction && !isKnownSafeError)) {
      response.status(500).json({
        code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.',
      });
      return;
    }

    response.status(500).json({
      message: error instanceof Error ? error.message : 'Unexpected server error.',
    });
  });

  return app;
}
