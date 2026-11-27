-- Notificações (Web Push/VAPID). Idempotente.

create table if not exists push_inscricao (
  endpoint text primary key,
  usuario_id uuid not null references usuario(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now(),
  falhas integer not null default 0
);
create index if not exists push_inscricao_usuario on push_inscricao (usuario_id);

-- Um aviso (chave) vai uma vez por usuário.
create table if not exists push_enviado (
  usuario_id uuid not null references usuario(id) on delete cascade,
  chave text not null,
  enviado_em timestamptz not null default now(),
  primary key (usuario_id, chave)
);

-- Avisos que ainda não foram enviados a cada usuário. Mesmas regras do app (src/modules/avisos/regras.ts).
-- Destinatários: veterinários atribuídos à propriedade.
create or replace function avisos_pendentes(p_hoje date, p_dias_laudo integer, p_antecedencia integer)
returns table (usuario_id uuid, chave text, titulo text, corpo text, url text)
language sql stable as $$
  with destino as (
    select a.usuario_id, a.propriedade_id from atribuicao a
    join usuario u on u.id = a.usuario_id and u.ativo and u.excluido_em is null
    where a.excluido_em is null
  ),
  revisitas as (
    select d.usuario_id, 'revisita:' || c.id as chave,
      'Revisita ' || case when c.data_revisita = p_hoje then 'hoje'
                          when c.data_revisita > p_hoje then 'amanhã (' || to_char(c.data_revisita, 'DD/MM/YYYY') || ')'
                          else 'atrasada desde ' || to_char(c.data_revisita, 'DD/MM/YYYY') end as titulo,
      an.identificacao || ' · ' || p.nome as corpo,
      '/animais/' || an.id as url
    from conduta c
    join visita_animal va on va.id = c.visita_animal_id and va.excluido_em is null
    join visita v on v.id = va.visita_id and v.excluido_em is null
    join animal an on an.id = va.animal_id and an.excluido_em is null
    join propriedade p on p.id = an.propriedade_id
    join destino d on d.propriedade_id = an.propriedade_id
    where c.excluido_em is null and c.tipo = 'revisita'
      and c.data_revisita between p_hoje - 30 and p_hoje + p_antecedencia
      and not exists (
        select 1 from visita_animal va2 join visita v2 on v2.id = va2.visita_id and v2.excluido_em is null
        where va2.animal_id = va.animal_id and va2.excluido_em is null and va2.id <> va.id and v2.data > v.data)
  ),
  culturas as (
    select d.usuario_id, 'cultura:' || v.id || ':' || max(cu.criado_em)::date as chave,
      'Resultado de cultura disponível' as titulo,
      p.nome || ' · visita de ' || to_char(v.data, 'DD/MM/YYYY') || ' · ' || count(*) ||
        case when count(*) = 1 then ' resultado' else ' resultados' end as corpo,
      '/visitas/' || v.id || '/laboratorio' as url
    from cultura cu
    join amostra am on am.id = cu.amostra_id and am.excluido_em is null
    join visita v on v.id = am.visita_id and v.excluido_em is null
    join propriedade p on p.id = v.propriedade_id
    join destino d on d.propriedade_id = v.propriedade_id
    where cu.excluido_em is null and cu.criado_em > now() - interval '3 days'
      and coalesce(cu.atualizado_por, '') <> d.usuario_id::text and coalesce(cu.atualizado_por, '') <> 'sistema'
    group by d.usuario_id, v.id, v.data, p.nome
  ),
  laudos as (
    select d.usuario_id, 'laudo:' || v.id as chave, 'Laudo pendente de envio' as titulo,
      p.nome || ' · visita de ' || to_char(v.data, 'DD/MM/YYYY') as corpo,
      '/visitas/' || v.id || '/resumo' as url
    from visita v
    join propriedade p on p.id = v.propriedade_id
    join destino d on d.propriedade_id = v.propriedade_id
    where v.excluido_em is null and v.status <> 'laudo_enviado'
      and v.data <= p_hoje - p_dias_laudo and v.data > p_hoje - 60
      and exists (select 1 from visita_animal va where va.visita_id = v.id and va.excluido_em is null)
      and not exists (
        select 1 from amostra am where am.visita_id = v.id and am.excluido_em is null
          and not exists (select 1 from cultura cu where cu.amostra_id = am.id and cu.excluido_em is null))
  ),
  todos as (select * from revisitas union all select * from culturas union all select * from laudos)
  select t.* from todos t
  where not exists (select 1 from push_enviado e where e.usuario_id = t.usuario_id and e.chave = t.chave)
$$;
