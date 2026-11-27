-- LactoNexo · funções de sincronização. Rodam iguais no Supabase (chamadas por RPC).
--
-- Regra de conflito (documentada em docs/sync.md):
--   * Por campo, vence o carimbo HLC mais recente.
--   * Todo valor recebido fica em sync_operacao e auditoria, inclusive o que perdeu.
--   * Se o mesmo campo foi alterado por OUTRA pessoa depois da versão que o aparelho conhecia,
--     e o campo é clínico, cria-se um registro em `conflito` para os vets revisarem.
--   * Exclusão contra edição concorrente de outra pessoa: a edição vence e o registro continua.

create or replace function sync_tabelas() returns text[] language sql immutable as $$
  select array['usuario','propriedade','atribuicao','animal','visita','visita_animal','conduta','foto',
    'catalogo_item','regra','alerta','conflito','exame_teto','amostra','amostra_origem','cultura','antibiograma',
    'antibiograma_amostra','antibiograma_resultado']
$$;

-- Tabelas da organização inteira (não pertencem a uma propriedade).
create or replace function sync_tabelas_org() returns text[] language sql immutable as $$
  select array['usuario','catalogo_item','regra']
$$;

-- Campos clínicos: sobrescrita concorrente por outra pessoa gera conflito para revisão.
create or replace function sync_campo_clinico(p_tabela text, p_campo text) returns boolean language sql immutable as $$
  select (p_tabela, p_campo) in (
    ('exame_teto','tamis'), ('exame_teto','cmt'), ('exame_teto','posicao'),
    ('cultura','microrganismo_id'), ('cultura','sem_crescimento'),
    ('antibiograma','rotulo_microrganismo'), ('antibiograma_resultado','resultado'),
    ('conduta','tipo'), ('conduta','produto'), ('conduta','dose'), ('conduta','periodo'), ('conduta','data_revisita'),
    ('animal','identificacao'), ('amostra','numero_tubo')
  ) or p_campo = 'excluido_em'
$$;

-- Propriedade a que um registro pertence (pelos pais). null = tabela da organização ou pai ainda não chegou.
create or replace function sync_propriedade_de(p_tabela text, p_dados jsonb) returns uuid
language plpgsql stable as $$
declare v uuid;
begin
  case p_tabela
    when 'propriedade' then return (p_dados->>'id')::uuid;
    when 'animal', 'visita', 'atribuicao' then return (p_dados->>'propriedade_id')::uuid;
    when 'visita_animal', 'amostra', 'antibiograma' then
      select propriedade_id into v from visita where id = (p_dados->>'visita_id')::uuid;
    when 'conduta', 'exame_teto' then
      select propriedade_id into v from visita_animal where id = (p_dados->>'visita_animal_id')::uuid;
    when 'amostra_origem', 'cultura' then
      select propriedade_id into v from amostra where id = (p_dados->>'amostra_id')::uuid;
    when 'antibiograma_amostra', 'antibiograma_resultado' then
      select propriedade_id into v from antibiograma where id = (p_dados->>'antibiograma_id')::uuid;
    when 'alerta' then
      select propriedade_id into v from animal where id = (p_dados->>'animal_id')::uuid;
    when 'foto', 'conflito' then
      declare t text := coalesce(p_dados->>'dono_tabela', p_dados->>'tabela');
              rid uuid := coalesce(p_dados->>'dono_id', p_dados->>'registro_id')::uuid;
      begin
        if not t = any(sync_tabelas()) or t = any(sync_tabelas_org()) then return null; end if;
        execute format('select propriedade_id from %I where id = $1', t) into v using rid;
      end;
    else
      return null;
  end case;
  return v;
end $$;

create or replace function sync_hlc_servidor() returns text language sql stable as $$
  select lpad((floor(extract(epoch from clock_timestamp()) * 1000))::bigint::text, 15, '0') || '-00000-servidor'
$$;

create or replace function sync_tem_acesso(p_usuario uuid, p_admin boolean, p_propriedade uuid) returns boolean
language sql stable as $$
  select p_admin or exists (
    select 1 from atribuicao a
    where a.usuario_id = p_usuario and a.propriedade_id = p_propriedade and a.excluido_em is null)
$$;

/**
 * Recebe um lote de operações do aparelho. Idempotente: op_id já recebido é aceito sem reaplicar.
 * Retorna { aceitas: [op_id], rejeitadas: [{op_id, motivo}], adiadas: [op_id], hlc_servidor }.
 * "adiadas" = o registro pai ainda não chegou; o aparelho reenvia depois.
 */
create or replace function sync_push(p_usuario uuid, p_ops jsonb) returns jsonb
language plpgsql as $$
declare
  u usuario%rowtype;
  op jsonb;
  v_op uuid;
  v_tab text;
  v_id uuid;
  v_hlc text;
  v_base bigint;
  v_campos jsonb;
  v_atual jsonb;
  v_novo jsonb;
  v_k text;
  v_val jsonb;
  cv record;
  v_conc boolean;
  v_aplicados text[];
  v_seq bigint;
  v_prop uuid;
  v_cols text;
  v_admin boolean;
  aceitas jsonb := '[]';
  rejeitadas jsonb := '[]';
  adiadas jsonb := '[]';
begin
  -- Serializa as gravações: garante que o cursor (versao) nunca "pule" uma transação ainda aberta.
  perform pg_advisory_xact_lock(7311);

  select * into u from usuario where id = p_usuario and ativo and excluido_em is null;
  if not found then raise exception 'Usuário inválido ou inativo'; end if;
  v_admin := u.perfil = 'admin';

  for op in select value from jsonb_array_elements(p_ops) loop
    v_op := (op->>'op_id')::uuid;
    if exists (select 1 from sync_operacao where op_id = v_op) then
      aceitas := aceitas || to_jsonb(v_op);
      continue;
    end if;

    begin
      v_tab := op->>'tabela';
      v_id := (op->>'registro_id')::uuid;
      v_hlc := op->>'hlc';
      v_base := coalesce((op->>'versao_base')::bigint, 0);
      if v_tab is null or not v_tab = any(sync_tabelas()) then raise exception 'Tabela desconhecida: %', v_tab; end if;
      if v_hlc is null then raise exception 'Operação sem HLC'; end if;

      -- Campos que o aparelho nunca define.
      v_campos := (op->'campos') - 'id' - 'versao' - 'organizacao_id' - 'senha_hash' - 'atualizado_por';
      if v_tab not in ('animal', 'visita', 'atribuicao') then v_campos := v_campos - 'propriedade_id'; end if;
      if v_tab = 'usuario' and not v_admin then raise exception 'Sem permissão para alterar usuários'; end if;
      if v_tab in ('atribuicao', 'regra') and not v_admin then raise exception 'Sem permissão para alterar %', v_tab; end if;

      execute format('select to_jsonb(t) from %I t where id = $1', v_tab) into v_atual using v_id;
      v_novo := coalesce(v_atual, jsonb_build_object('id', v_id, 'criado_em', coalesce(v_campos->>'criado_em', now()::text)));
      v_campos := v_campos - 'criado_em';
      v_aplicados := '{}';

      -- Registro excluído por outra pessoa enquanto este aparelho editava: a edição vence.
      if v_atual is not null and v_atual->>'excluido_em' is not null and not v_campos ? 'excluido_em' then
        select * into cv from campo_versao where tabela = v_tab and registro_id = v_id and campo = 'excluido_em';
        if found and cv.versao > v_base and cv.usuario_id <> p_usuario then
          v_novo := jsonb_set(v_novo, '{excluido_em}', 'null');
          v_aplicados := v_aplicados || 'excluido_em';
          insert into conflito (organizacao_id, tabela, registro_id, campo, valor_vencedor, valor_perdedor, autor_vencedor, autor_perdedor)
          values (u.organizacao_id, v_tab, v_id, 'excluido_em', 'null', v_atual->'excluido_em', p_usuario::text, cv.usuario_id::text);
        end if;
      end if;

      for v_k, v_val in select key, value from jsonb_each(v_campos) loop
        if v_k = 'atualizado_em' then continue; end if;
        select * into cv from campo_versao where tabela = v_tab and registro_id = v_id and campo = v_k;
        v_conc := found and cv.versao > v_base and cv.usuario_id <> p_usuario
                  and (v_atual -> v_k) is distinct from v_val;

        -- Exclusão contra edição concorrente de outra pessoa: não exclui.
        if v_k = 'excluido_em' and v_val <> 'null'::jsonb and exists (
             select 1 from campo_versao c
             where c.tabela = v_tab and c.registro_id = v_id and c.campo <> 'excluido_em'
               and c.versao > v_base and c.usuario_id <> p_usuario) then
          insert into conflito (organizacao_id, tabela, registro_id, campo, valor_vencedor, valor_perdedor, autor_vencedor, autor_perdedor)
          values (u.organizacao_id, v_tab, v_id, 'excluido_em', 'null', v_val, null, p_usuario::text);
          insert into auditoria (usuario_id, op_id, tabela, registro_id, campo, valor_anterior, valor_novo, aplicado)
          values (p_usuario, v_op, v_tab, v_id, v_k, v_atual -> v_k, v_val, false);
          continue;
        end if;

        if not found or v_hlc > cv.hlc then
          insert into auditoria (usuario_id, op_id, tabela, registro_id, campo, valor_anterior, valor_novo, aplicado)
          values (p_usuario, v_op, v_tab, v_id, v_k, v_atual -> v_k, v_val, true);
          if v_conc and sync_campo_clinico(v_tab, v_k) then
            insert into conflito (organizacao_id, tabela, registro_id, campo, valor_vencedor, valor_perdedor, autor_vencedor, autor_perdedor)
            values (u.organizacao_id, v_tab, v_id, v_k, v_val, v_atual -> v_k, p_usuario::text, cv.usuario_id::text);
          end if;
          v_novo := jsonb_set(v_novo, array[v_k], v_val, true);
          v_aplicados := v_aplicados || v_k;
        else
          -- Chegou depois, mas é mais antigo: não aplica, fica registrado.
          insert into auditoria (usuario_id, op_id, tabela, registro_id, campo, valor_anterior, valor_novo, aplicado)
          values (p_usuario, v_op, v_tab, v_id, v_k, v_atual -> v_k, v_val, false);
          if v_conc and sync_campo_clinico(v_tab, v_k) then
            insert into conflito (organizacao_id, tabela, registro_id, campo, valor_vencedor, valor_perdedor, autor_vencedor, autor_perdedor)
            values (u.organizacao_id, v_tab, v_id, v_k, v_atual -> v_k, v_val, cv.usuario_id::text, p_usuario::text);
          end if;
        end if;
      end loop;

      if v_atual is null or array_length(v_aplicados, 1) > 0 then
        v_prop := sync_propriedade_de(v_tab, v_novo);
        if v_prop is null and not v_tab = any(sync_tabelas_org()) then
          raise exception using errcode = 'LX001', message = 'Registro pai ainda não sincronizado';
        end if;
        if v_prop is not null and v_tab <> 'propriedade' and not sync_tem_acesso(p_usuario, v_admin, v_prop) then
          raise exception 'Sem permissão nesta propriedade';
        end if;
        if v_tab = 'propriedade' and v_atual is not null and not sync_tem_acesso(p_usuario, v_admin, v_prop) then
          raise exception 'Sem permissão nesta propriedade';
        end if;

        v_seq := nextval('sync_seq');
        v_novo := v_novo || jsonb_build_object(
          'versao', v_seq, 'organizacao_id', u.organizacao_id, 'propriedade_id', v_prop,
          'atualizado_por', p_usuario::text,
          'atualizado_em', coalesce(v_campos->>'atualizado_em', now()::text));

        select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
        from information_schema.columns
        where table_schema = current_schema() and table_name = v_tab and column_name <> 'id';

        execute format(
          'insert into %1$I select * from jsonb_populate_record(null::%1$I, $1) '
          'on conflict (id) do update set (%2$s) = (select %2$s from jsonb_populate_record(null::%1$I, $1))',
          v_tab, v_cols) using v_novo;

        insert into campo_versao (tabela, registro_id, campo, hlc, usuario_id, versao)
        select v_tab, v_id, c, v_hlc, p_usuario, v_seq from unnest(v_aplicados) c
        on conflict (tabela, registro_id, campo) do update
          set hlc = excluded.hlc, usuario_id = excluded.usuario_id, versao = excluded.versao;

        -- Vet que cria uma propriedade passa a ter acesso a ela.
        if v_tab = 'propriedade' and v_atual is null and not v_admin then
          insert into atribuicao (id, organizacao_id, usuario_id, propriedade_id, atualizado_por, versao)
          values (gen_random_uuid(), u.organizacao_id, p_usuario, v_id, p_usuario::text, nextval('sync_seq'));
        end if;
      end if;

      insert into sync_operacao (op_id, usuario_id, tabela, registro_id, hlc, versao_base, campos)
      values (v_op, p_usuario, v_tab, v_id, v_hlc, v_base, op->'campos');
      aceitas := aceitas || to_jsonb(v_op);
    exception
      when sqlstate 'LX001' then
        adiadas := adiadas || to_jsonb(v_op);
      when others then
        rejeitadas := rejeitadas || jsonb_build_object('op_id', v_op, 'motivo', sqlerrm);
    end;
  end loop;

  -- Conflitos novos ganham versão (para o pull) e a propriedade do registro.
  update conflito c set propriedade_id = sync_propriedade_de('conflito', to_jsonb(c)), versao = nextval('sync_seq')
  where c.criado_em = now(); -- now() = início desta transação: só os conflitos criados agora

  return jsonb_build_object('aceitas', aceitas, 'rejeitadas', rejeitadas, 'adiadas', adiadas, 'hlc_servidor', sync_hlc_servidor());
end $$;

/**
 * Devolve o que mudou desde o cursor, só do que o usuário pode ver.
 * p_propriedade: download completo de uma propriedade ("Baixar para visita").
 */
create or replace function sync_pull(p_usuario uuid, p_cursor bigint, p_limite integer default 500, p_propriedade uuid default null)
returns jsonb language plpgsql stable as $$
declare
  u usuario%rowtype;
  v_sql text;
  v_res jsonb;
  v_max bigint;
  v_n integer;
begin
  select * into u from usuario where id = p_usuario and ativo and excluido_em is null;
  if not found then raise exception 'Usuário inválido ou inativo'; end if;
  if p_propriedade is not null and not sync_tem_acesso(p_usuario, u.perfil = 'admin', p_propriedade) then
    raise exception 'Sem permissão nesta propriedade';
  end if;

  select string_agg(format(
    'select %L as tabela, t.versao, to_jsonb(t) - ''senha_hash'' as registro from %I t where t.versao > $1 and t.organizacao_id = $2 and %s',
    t,
    t,
    case
      when t = any(sync_tabelas_org()) then case when p_propriedade is null then 'true' else 'false' end
      when p_propriedade is not null then 't.propriedade_id = $4'
      when u.perfil = 'admin' then 'true'
      else 't.propriedade_id in (select a.propriedade_id from atribuicao a where a.usuario_id = $3 and a.excluido_em is null)'
    end), ' union all ')
  into v_sql
  from unnest(sync_tabelas()) t;

  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object(''tabela'', x.tabela, ''registro'', x.registro) order by x.versao), ''[]''), max(x.versao), count(*) '
    'from (select * from (%s) u order by versao limit %s) x', v_sql, p_limite)
  into v_res, v_max, v_n
  using coalesce(p_cursor, 0), u.organizacao_id, p_usuario, p_propriedade;

  return jsonb_build_object(
    'mudancas', v_res,
    'cursor', coalesce(v_max, coalesce(p_cursor, 0))::text,
    'tem_mais', v_n >= p_limite);
end $$;
