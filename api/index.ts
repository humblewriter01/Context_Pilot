/**
 * Vercel serverless entry point.
 *
 * The Express application lives in ../server.ts and is shared with the
 * long-running Node server (`npm start`). It is imported lazily so that any
 * module-initialisation problem is reported as JSON instead of an opaque
 * 500 FUNCTION_INVOCATION_FAILED.
 */
type Handler = (req: any, res: any, next?: any) => unknown;

let cachedApp: Handler | null = null;

async function getApp(): Promise<Handler> {
  if (cachedApp) return cachedApp;

  const mod: any = await import('../server');
  const app = mod?.default ?? mod;

  if (typeof app !== 'function') {
    throw new Error('server.ts did not export a callable Express application.');
  }

  cachedApp = app as Handler;
  return cachedApp;
}

export default async function handler(req: any, res: any) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (err: any) {
    console.error('[Context Pilot] Serverless initialisation failed:', err);
    if (!res.headersSent) {
      res.status(500).setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: 'Serverless initialisation failed.',
          detail: String(err?.stack || err?.message || err),
        })
      );
    }
  }
}
