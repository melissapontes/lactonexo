# LactoNexo

PWA offline-first para médicos-veterinários que acompanham a saúde da glândula mamária em fazendas de leite.
Funciona 100% sem internet durante a visita e sincroniza depois.

O nome, as cores e o logo ficam em um único lugar: `src/config/app.ts` e `public/logo.svg`
(depois de trocar o logo, rode `npm run icons`). As cores da interface estão em `src/theme/tema.css`.

## Estado

| Etapa | Conteúdo | Situação |
| --- | --- | --- |
| a | Esqueleto PWA instalável e offline | feita |
| b | Cadastro e visita com preenchimento do laudo | feita |
| c | Sincronização com servidor e conflitos | feita |
| d | Histórico, painel e regras de decisão | próxima |
| e | Laudo em PDF e exportações | |
| f | Notificações push | |

## Rodar localmente

Requer Node 22.

```bash
npm install
npm run dev          # http://localhost:5173 (sem service worker)
npm run build && npm run preview   # http://localhost:4173 (com service worker, igual à produção)
```

Para testar o modo offline, use o build (`preview`): o service worker não roda em `dev`.

## Servidor (sincronização)

Sem `VITE_API_URL`, o app funciona só no aparelho, sem login (útil para testar). Com servidor:

```bash
# PostgreSQL 15+ rodando; crie o banco: createdb lactonexo
export DATABASE_URL=postgres://usuario:senha@localhost:5432/lactonexo
npm run server:usuario -- --email voce@exemplo.com --nome "Seu Nome" --perfil admin   # mostra a senha provisória
npm run server                                         # API em http://localhost:8787/api (aplica o esquema sozinha)
VITE_API_URL=http://localhost:8787 npm run dev         # app apontando para a API
```

Variáveis do servidor: `DATABASE_URL`, `JWT_SEGREDO` (obrigatória em produção), `PORT` (8787),
`ORIGENS` (endereços do app, separados por vírgula), `ACESSO_MINUTOS` (60), `DIAS_SESSAO` (30).

Cada vet só vê as propriedades atribuídas a ele (tabela `atribuicao`); quem cria uma propriedade ganha acesso a ela.
O administrador vê tudo. As regras de sincronização e conflito estão em [docs/sync.md](docs/sync.md).

Histórico por animal, painel da propriedade e regras de apoio à decisão: [docs/painel-e-regras.md](docs/painel-e-regras.md).

Laudo em PDF, envio ao produtor e planilhas: [docs/laudo-e-exportacoes.md](docs/laudo-e-exportacoes.md).

## Testes

```bash
npm test                         # unitários (fila de sync, HLC, backup, tabelas do laudo)
DATABASE_URL_TESTE=postgres://…/postgres npm run test:server   # servidor contra PostgreSQL real
npx playwright install webkit chromium   # uma vez
npm run build && npm run e2e     # E2E: rede cai no meio do preenchimento, fecha e reabre o app offline
# E2E com servidor (dois vets offline no mesmo teto): crie o banco e rode
createdb lactonexo_e2e && npm run build:e2e && E2E_DATABASE_URL=postgres://…/lactonexo_e2e npm run e2e
```

O E2E roda no WebKit (motor do Safari) e no Chromium. O CI do GitHub roda os dois a cada pull request.
O checklist para iPhone real está em [docs/checklist-iphone.md](docs/checklist-iphone.md).

## Publicar

O app é estático (pasta `dist/`) e precisa de HTTPS. Recomendado: Cloudflare Pages ou Netlify, gratuitos.

- Comando de build: `npm run build`
- Pasta publicada: `dist`
- Todas as rotas devem cair no `index.html` (regra de SPA). No Netlify, `public/_redirects` com `/* /index.html 200`;
  no Cloudflare Pages isso é automático.
- `sw.js` e `index.html` não podem ficar em cache longo no CDN (cabeçalho `Cache-Control: no-cache`),
  senão o aviso de nova versão demora a aparecer.

## Instalar no celular

**iPhone (Safari):** abra o endereço no Safari → toque em Compartilhar → Adicionar à Tela de Início → Adicionar.
Abra sempre pelo ícone. No iPhone o Safari e o app instalado guardam dados separados, por isso registre visitas
só no app instalado. Push só funciona no iOS 16.4+ com o app instalado.

**Android (Chrome):** abra o endereço → o próprio app oferece "Instalar" (ou menu ⋮ → Instalar app).

**Computador (Chrome/Edge):** ícone de instalar na barra de endereço.

## Arquitetura

Proposta aprovada: [LactoNexo — Proposta de arquitetura](https://claude.ai/artifact/4Q4nizh2e8yceT2cDt1Xxf).

- `src/db/` banco local Dexie (IndexedDB) e tipos de todas as entidades. Migrações versionadas em `db.ts`.
- `src/sync/` fila de operações (outbox), relógio HLC, motor de sync e a interface `SyncTransport`
  (trocar de servidor, por exemplo para o Supabase, é implementar essa interface).
- `src/sw.ts` service worker: pré-cache do app shell, fallback de navegação offline, push.
- `src/components/` barra de status, onboarding de instalação, aviso de nova versão, campos com salvamento automático.
- `src/modules/mastite/` módulo de mastite: constantes (tetos, graus de CMT), listas padrão, cálculo das Tabelas 1 a 3,
  montagem do laudo e o laudo de exemplo (`seed-laudo.ts`).
- `src/pages/` telas. A visita tem três abas: Animais (tetos), Laboratório (cultura e antibiograma) e Resumo (laudo).

## Dados de exemplo

Só para testes: em Configurações → Dados de teste, "Carregar laudo de exemplo" carrega o laudo NAPROSA/UFPB de 29/09/2026
(Logradouro, Queimadas-PB, 8 animais, 32 tetos, 11 tubos), exatamente como impresso. Os nomes nunca são corrigidos
pelo sistema (inclusive "Streptococcus aureus" no antibiograma).

As Tabelas 1 a 3 são calculadas a partir dos dados. Por isso, com o laudo de exemplo, a Tabela 2 mostra 25 negativos
e 0 Traços (o laudo impresso diz 24 e 1), e a Tabela 3 mostra 11 amostras de 6 animais com "Staphylococcus spp." 2
(o impresso diz 8 amostras de 2 animais e "Streptococcus spp." 2).

As listas padrão (microrganismos, antibióticos, categorias) têm ids fixos, iguais em todo aparelho, e não entram na
fila de sincronização. O servidor (etapa c) deve criar os mesmos ids.
