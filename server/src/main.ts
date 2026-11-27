import { serve } from '@hono/node-server';
import { criarApp } from './app';
import { config } from './config';
import { migrar, pool } from './db';

await migrar();
serve({ fetch: criarApp(pool).fetch, port: config.porta }, (i) => console.log(`API do LactoNexo em http://localhost:${i.port}/api`));
