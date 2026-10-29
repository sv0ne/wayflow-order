import { serve } from '@hono/node-server';
import app from './app.ts';

declare const process: { env: Record<string, string | undefined> };

const port = Number(process.env.API_PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Mock API listening on http://127.0.0.1:${info.port}`);
});
