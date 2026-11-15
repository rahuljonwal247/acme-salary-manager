import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler, notFoundHandler } from './http/errorHandler';
import { apiRouter, type RouteDeps, type RouteOptions } from './http/routes';

export interface AppOptions extends RouteOptions {
  corsOrigins?: string[];
  logRequests?: boolean;
}

/** Builds the Express app from injected dependencies — no globals, so tests can pass fakes. */
export function createApp(deps: RouteDeps, options: AppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: options.corsOrigins ?? true }));
  app.use(express.json({ limit: '100kb' }));
  if (options.logRequests) app.use(morgan('tiny'));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api', apiRouter(deps, options));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
