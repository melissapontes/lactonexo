-- LactoNexo · esquema do servidor (PostgreSQL 15+; compatível com Supabase).
-- O servidor é a fonte da verdade. Cada tabela sincronizada tem as mesmas colunas do cliente (src/db/tipos.ts)
-- mais `propriedade_id` (calculada no servidor para tabelas filhas) e `versao` (sequência global, usada como cursor).

create extension if not exists pgcrypto;

create sequence if not exists sync_seq;

create table if not exists organizacao (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

-- Colunas comuns, repetidas em cada tabela (ver tipos.ts → Registro).
--   id, organizacao_id, criado_em, atualizado_em, atualizado_por, versao, excluido_em, propriedade_id

create table if not exists usuario (
  id uuid primary key,
  organizacao_id uuid not null references organizacao(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  versao bigint not null default nextval('sync_seq'),
  excluido_em timestamptz,
  propriedade_id uuid,
  nome text not null,
  email text not null,
  perfil text not null check (perfil in ('admin', 'veterinario')),
  crmv text,
  ativo boolean not null default true,
  senha_hash text -- só no servidor; nunca vai para o cliente
);
create unique index if not exists usuario_email on usuario (lower(email));

create table if not exists propriedade (
  id uuid primary key, organizacao_id uuid not null references organizacao(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), atualizado_por text,
  versao bigint not null default nextval('sync_seq'), excluido_em timestamptz, propriedade_id uuid,
  nome text not null,
  proprietario_nome text, proprietario_telefone text, proprietario_email text,
  municipio text, uf text, observacoes text
);

create table if not exists atribuicao (
  id uuid primary key, organizacao_id uuid not null references organizacao(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), atualizado_por text,
  versao bigint not null default nextval('sync_seq'), excluido_em timestamptz, propriedade_id uuid,
  usuario_id uuid not null
);
create index if not exists atribuicao_usuario on atribuicao (usuario_id, propriedade_id);

create table if not exists animal (
  id uuid primary key, organizacao_id uuid not null references organizacao(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), atualizado_por text,
  versao bigint not null default nextval('sync_seq'), excluido_em timestamptz, propriedade_id uuid,
  identificacao text not null, raca text, categoria text, data_ultimo_parto date, ativo boolean not null default true
);

create table if not exists visita (
  id uuid primary key, organizacao_id uuid not null references organizacao(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), atualizado_por text,
  versao bigint not null default nextval('sync_seq'), excluido_em timestamptz, propriedade_id uuid,
  data date not null, veterinario_id text, instituicao text, status text not null default 'em_campo'
);

create table if not exists visita_animal (
  id uuid primary key, organizacao_id uuid not null references organizacao(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), atualizado_por text,
  versao bigint not null default nextval('sync_seq'), excluido_em timestamptz, propriedade_id uuid,
  visita_id uuid not null, animal_id uuid not null, ordem integer not null
);

create table if not exists conduta (
  id uuid primary key, organizacao_id uuid not null references organizacao(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), atualizado_por text,
  versao bigint not null default nextval('sync_seq'), excluido_em timestamptz, propriedade_id uuid,
  visita_animal_id uuid not null, teto text, tipo text not null, produto text, dose text, periodo text,
  data_revisita date, alerta_origem_id uuid, observacao text
);

create table if not exists foto (
  id uuid primary key, organizacao_id uuid not null references organizacao(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), atualizado_por text,
  versao bigint not null default nextval('sync_seq'), excluido_em timestamptz, propriedade_id uuid,
  dono_tabela text not null, dono_id uuid not null, legenda text,
  largura integer, altura integer, bytes integer, envio text, bytes_enviados integer
);

create table if not exists catalogo_item (
  id uuid primary key, organizacao_id uuid not null references organizacao(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), atualizado_por text,
  versao bigint not null default nextval('sync_seq'), excluido_em timestamptz, propriedade_id uuid,
  tipo text not null, nome text not null, ordem integer not null default 0, ativo boolean not null default true
);

create table if not exists regra (
  id uuid primary key, organizacao_id uuid not null references organizacao(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), atualizado_por text,
  versao bigint not null default nextval('sync_seq'), excluido_em timestamptz, propriedade_id uuid,
  modulo text not null, tipo text not null, parametros jsonb not null default '{}', ativa boolean not null default true
);

create table if not exists alerta (
  id uuid primary key, organizacao_id uuid not null references organizacao(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), atualizado_por text,
  versao bigint not null default nextval('sync_seq'), excluido_em timestamptz, propriedade_id uuid,
  regra_id uuid, animal_id uuid not null, teto text, visita_id uuid, mensagem text, status text not null default 'aberto'
);

create table if not exists conflito (
  id uuid primary key default gen_random_uuid(), organizacao_id uuid not null references organizacao(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), atualizado_por text,
  versao bigint not null default nextval('sync_seq'), excluido_em timestamptz, propriedade_id uuid,
  tabela text not null, registro_id uuid not null, campo text not null,
  valor_vencedor jsonb, valor_perdedor jsonb, autor_vencedor text, autor_perdedor text,
  status text not null default 'pendente'
);

create table if not exists exame_teto (
  id uuid primary key, organizacao_id uuid not null references organizacao(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), atualizado_por text,
  versao bigint not null default nextval('sync_seq'), excluido_em timestamptz, propriedade_id uuid,
  visita_animal_id uuid not null, posicao text, linha integer not null, tamis text, cmt text
);

create table if not exists amostra (
  id uuid primary key, organizacao_id uuid not null references organizacao(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), atualizado_por text,
  versao bigint not null default nextval('sync_seq'), excluido_em timestamptz, propriedade_id uuid,
  visita_id uuid not null, numero_tubo text not null, tipo text not null, data_coleta date, linha_laudo integer
);

create table if not exists amostra_origem (
  id uuid primary key, organizacao_id uuid not null references organizacao(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), atualizado_por text,
  versao bigint not null default nextval('sync_seq'), excluido_em timestamptz, propriedade_id uuid,
  amostra_id uuid not null, exame_teto_id uuid not null
);

create table if not exists cultura (
  id uuid primary key, organizacao_id uuid not null references organizacao(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), atualizado_por text,
  versao bigint not null default nextval('sync_seq'), excluido_em timestamptz, propriedade_id uuid,
  amostra_id uuid not null, data_resultado date, microrganismo_id uuid, sem_crescimento boolean not null default false, observacao text
);

create table if not exists antibiograma (
  id uuid primary key, organizacao_id uuid not null references organizacao(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), atualizado_por text,
  versao bigint not null default nextval('sync_seq'), excluido_em timestamptz, propriedade_id uuid,
  visita_id uuid not null, rotulo_microrganismo text not null, data date
);

create table if not exists antibiograma_amostra (
  id uuid primary key, organizacao_id uuid not null references organizacao(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), atualizado_por text,
  versao bigint not null default nextval('sync_seq'), excluido_em timestamptz, propriedade_id uuid,
  antibiograma_id uuid not null, amostra_id uuid not null
);

create table if not exists antibiograma_resultado (
  id uuid primary key, organizacao_id uuid not null references organizacao(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), atualizado_por text,
  versao bigint not null default nextval('sync_seq'), excluido_em timestamptz, propriedade_id uuid,
  antibiograma_id uuid not null, antibiotico_id uuid not null, resultado text not null, ordem integer not null default 0
);

-- Índices de cursor e de acesso por propriedade.
do $$
declare t text;
begin
  foreach t in array array['usuario','propriedade','atribuicao','animal','visita','visita_animal','conduta','foto',
    'catalogo_item','regra','alerta','conflito','exame_teto','amostra','amostra_origem','cultura','antibiograma',
    'antibiograma_amostra','antibiograma_resultado'] loop
    execute format('create index if not exists %I on %I (versao)', t || '_versao', t);
    execute format('create index if not exists %I on %I (propriedade_id, versao)', t || '_prop_versao', t);
  end loop;
end $$;

-- ---------- Controle de sync, sessão e auditoria (não sincronizam) ----------

create table if not exists sync_operacao (
  op_id uuid primary key,
  usuario_id uuid not null,
  tabela text not null,
  registro_id uuid not null,
  hlc text not null,
  versao_base bigint not null default 0,
  campos jsonb not null, -- guarda o que o aparelho enviou, mesmo o que perdeu: nada se perde
  recebida_em timestamptz not null default now()
);

-- Último carimbo de cada campo: base da regra "por campo, última edição vence".
create table if not exists campo_versao (
  tabela text not null,
  registro_id uuid not null,
  campo text not null,
  hlc text not null,
  usuario_id uuid not null,
  versao bigint not null,
  primary key (tabela, registro_id, campo)
);

create table if not exists auditoria (
  id bigserial primary key,
  quando timestamptz not null default now(),
  usuario_id uuid,
  op_id uuid,
  tabela text not null,
  registro_id uuid not null,
  campo text not null,
  valor_anterior jsonb,
  valor_novo jsonb,
  aplicado boolean not null
);
create index if not exists auditoria_registro on auditoria (tabela, registro_id, quando);

create table if not exists sessao_renovacao (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuario(id),
  token_hash text not null unique,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  revogado_em timestamptz
);

create table if not exists foto_arquivo (
  foto_id uuid primary key,
  tipo text not null,
  bytes_total integer not null,
  bytes_recebidos integer not null default 0,
  dados bytea not null default ''::bytea,
  completo boolean not null default false,
  atualizado_em timestamptz not null default now()
);
