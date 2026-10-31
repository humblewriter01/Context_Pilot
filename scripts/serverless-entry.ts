/**
 * Serverless entry point source.
 *
 * Bundled by scripts/build-api.mjs into api/index.js (ESM) so that the Vercel
 * Node runtime receives a fully self-contained Express application. Using a
 * prebuilt bundle avoids extensionless ESM import failures inside /var/task,
 * where the TypeScript sources are not available at runtime.
 */
import app from '../server';

export default app;
