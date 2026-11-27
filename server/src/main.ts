import { serve } from '@hono/node-server';
import { criarApp } from './app';
import { config } from './config';
import { migrar, pool } from './db';
import { agendarAvisos, pushConfigurado } from './push';

await migrar();
serve({ fetch: criarApp(pool).fetch, port: config.porta }, (i) => console.log(`API do LactoNexo em http://localhost:${i.port}/api`));

agendarAvisos(pool);
if (!pushConfigurado()) console.log('Notificações push desligadas: defina VAPID_PUBLICA e VAPID_PRIVADA (npm run server:vapid).');
