import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { tituloPagina } from '../config/app';
import { db } from '../db/db';
import type { Conflito, TabelaSync } from '../db/tipos';
import { formatarDataHora } from '../lib/datas';
import { salvar } from '../sync/mutacoes';

const NOME_CAMPO: Record<string, string> = {
  cmt: 'CMT', tamis: 'Tamis', posicao: 'Posição do teto', microrganismo_id: 'Resultado da cultura', sem_crescimento: 'Sem crescimento',
  rotulo_microrganismo: 'Microrganismo do antibiograma', resultado: 'Resultado do antibiograma', identificacao: 'Identificação do animal',
  numero_tubo: 'Nº do tubo', excluido_em: 'Exclusão', tipo: 'Conduta', produto: 'Produto', dose: 'Dose', periodo: 'Período', data_revisita: 'Data de revisita',
};
const NOME_TABELA: Record<string, string> = {
  exame_teto: 'Exame do teto', cultura: 'Cultura', antibiograma: 'Antibiograma', antibiograma_resultado: 'Antibiograma',
  conduta: 'Conduta', animal: 'Animal', amostra: 'Tubo',
};

function mostrar(campo: string, v: unknown) {
  if (campo === 'excluido_em') return v ? 'Excluir' : 'Manter';
  if (v === null || v === undefined || v === '') return '(vazio)';
  return String(v);
}

/** Conflitos que o servidor sinalizou: o vet escolhe qual valor fica. Nada é decidido sozinho. */
export function Conflitos() {
  useEffect(() => {
    document.title = tituloPagina('Conflitos');
  }, []);
  const lista = useLiveQuery(async () => {
    const cs = await db.conflito.filter((c) => c.status === 'pendente' && !c.excluido_em).toArray();
    const nomes = new Map((await db.usuario.toArray()).map((u) => [u.id, u.nome]));
    const micros = new Map((await db.catalogo_item.toArray()).map((i) => [i.id, i.nome]));
    return Promise.all(
      cs.map(async (c) => {
        const reg = (await db.table(c.tabela).get(c.registro_id)) as Record<string, unknown> | undefined;
        const fmt = (v: unknown) => (c.campo === 'microrganismo_id' && typeof v === 'string' ? (micros.get(v) ?? v) : v);
        return { c, reg, vencedor: fmt(c.valor_vencedor), perdedor: fmt(c.valor_perdedor), autorV: nomes.get(c.autor_vencedor) ?? 'outro vet', autorP: nomes.get(c.autor_perdedor) ?? 'outro vet' };
      }),
    );
  }, []);

  const escolher = async (c: Conflito, valor: unknown) => {
    await salvar(c.tabela as TabelaSync, { id: c.registro_id, [c.campo]: c.campo === 'excluido_em' && !valor ? null : valor });
    await salvar('conflito', { id: c.id, status: 'revisado' });
  };

  return (
    <main className="conteudo">
      <Link to="/" className="voltar">‹ Início</Link>
      <h1>Conflitos para revisar</h1>
      <p className="suave">
        Duas pessoas alteraram o mesmo dado sem internet. O valor mais recente já está valendo; confira e escolha o correto.
      </p>
      {lista?.length === 0 && <p className="cartao">Nenhum conflito pendente.</p>}
      <ul className="lista-cartoes" style={{ gridTemplateColumns: '1fr' }}>
        {lista?.map(({ c, vencedor, perdedor, autorV, autorP }) => (
          <li key={c.id} className="cartao" data-testid="conflito">
            <strong>{NOME_TABELA[c.tabela] ?? c.tabela} · {NOME_CAMPO[c.campo] ?? c.campo}</strong>
            <span className="suave">Sinalizado em {formatarDataHora(c.criado_em)}</span>
            <div className="form-linha" style={{ marginTop: 8 }}>
              <button type="button" className="botao botao-primario" onClick={() => void escolher(c, c.valor_vencedor)}>
                Manter “{mostrar(c.campo, vencedor)}” ({autorV}, em uso)
              </button>
              <button type="button" className="botao" onClick={() => void escolher(c, c.valor_perdedor)}>
                Usar “{mostrar(c.campo, perdedor)}” ({autorP})
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
