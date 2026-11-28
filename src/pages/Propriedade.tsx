import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { tituloPagina } from '../config/app';
import { db } from '../db/db';
import { CampoAuto } from '../components/Campos';
import { formatarData } from '../lib/datas';
import { lerMeta } from '../db/db';
import { criarVisita, garantirCatalogo, hojeISO, itensCatalogo } from '../modules/mastite/dados';
import { salvar } from '../sync/mutacoes';
import { UFS } from './Inicio';
import { API_URL } from '../sync/sessao';
import { baixarPropriedade } from '../sync/motor';
import { formatarDataHora } from '../lib/datas';
import { useOnline } from '../sync/useEstadoSync';
import { useSugestoes } from '../components/Sugestoes';
import { Fab } from '../components/Fab';

const STATUS: Record<string, string> = {
  em_campo: 'Em campo',
  aguardando_laboratorio: 'Aguardando laboratório',
  concluida: 'Concluída',
  laudo_enviado: 'Laudo enviado',
};
export { STATUS as STATUS_VISITA };

export function Propriedade() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const p = useLiveQuery(() => db.propriedade.get(id), [id]);
  const animais = useLiveQuery(
    async () =>
      (await db.animal.where('propriedade_id').equals(id).filter((a) => !a.excluido_em).toArray()).sort((a, b) =>
        a.identificacao.localeCompare(b.identificacao, 'pt-BR', { numeric: true }),
      ),
    [id],
  );
  const visitas = useLiveQuery(
    async () => (await db.visita.where('propriedade_id').equals(id).filter((v) => !v.excluido_em).toArray()).sort((a, b) => b.data.localeCompare(a.data)),
    [id],
  );
  const categorias = useLiveQuery(() => itensCatalogo('categoria'), []);
  const [novoAnimalAberto, setNovoAnimalAberto] = useState(false);
  const [aviso, setAviso] = useState('');
  const [editar, setEditar] = useState(false);
  const online = useOnline();
  const baixadoEm = useLiveQuery(() => lerMeta<string>(`baixado:${id}`), [id]);
  const [baixando, setBaixando] = useState('');
  const sugestoes = useSugestoes(id);
  const abertas = sugestoes?.filter((s) => s.estado === 'aberta').length ?? 0;

  useEffect(() => {
    if (p) document.title = tituloPagina(p.nome);
    void garantirCatalogo();
  }, [p]);

  if (p === undefined) return <main className="conteudo">Carregando…</main>;
  if (!p) return <main className="conteudo">Propriedade não encontrada.</main>;

  async function novoAnimal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const identificacao = String(f.get('identificacao') ?? '').trim();
    if (!identificacao) return;
    if (animais?.some((a) => a.identificacao === identificacao)) {
      setAviso(`Já existe um animal "${identificacao}" nesta propriedade.`);
      return;
    }
    await salvar('animal', { propriedade_id: id, identificacao, categoria: String(f.get('categoria') || '') || undefined, ativo: true });
    form.reset();
    setAviso('');
    (form.elements.namedItem('identificacao') as HTMLInputElement).focus();
  }

  return (
    <main className="conteudo">
      <Link to="/" className="voltar">‹ Propriedades</Link>
      <div className="topo-pagina">
        <div>
          <h1>{p.nome}</h1>
          <p className="suave" style={{ margin: '4px 0 0' }}>
            {[p.proprietario_nome, [p.municipio, p.uf].filter(Boolean).join('-')].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button type="button" className="botao" onClick={() => setEditar((v) => !v)} aria-expanded={editar}>
          {editar ? 'Fechar dados' : 'Editar dados'}
        </button>
      </div>

      <Link to={`/propriedades/${id}/painel`} className="cartao cartao-link" data-testid="link-painel">
        <strong>Painel e sugestões</strong>
        <span className={abertas ? 'selo selo-alerta' : 'suave'}>{abertas ? `${abertas} ${abertas === 1 ? 'sugestão aberta' : 'sugestões abertas'}` : 'Prevalência, agentes e resistência'}</span>
      </Link>

      {API_URL && (
        <section className="cartao" aria-label="Uso offline">
          <div className="topo-pagina">
            <span data-testid="baixado">
              {baixadoEm ? `✓ Pronta para uso offline (baixada em ${formatarDataHora(baixadoEm)})` : 'Ainda não baixada para uso offline.'}
            </span>
            <button
              type="button"
              className="botao"
              disabled={!online || baixando === '…'}
              onClick={async () => {
                setBaixando('…');
                try {
                  const n = await baixarPropriedade(id);
                  setBaixando(`${n} registros atualizados.`);
                } catch (e) {
                  setBaixando(e instanceof Error ? e.message : 'Falha ao baixar.');
                }
              }}
            >
              {baixando === '…' ? 'Baixando…' : 'Baixar para visita'}
            </button>
          </div>
          {baixando && baixando !== '…' && <p className="suave" role="status" style={{ margin: '8px 0 0' }}>{baixando}</p>}
        </section>
      )}

      {editar && (
        <section className="cartao grade-campos" aria-label="Dados da propriedade">
          <CampoAuto tabela="propriedade" id={id} campo="nome" valor={p.nome} rotulo="Nome" obrigatorio />
          <CampoAuto tabela="propriedade" id={id} campo="proprietario_nome" valor={p.proprietario_nome} rotulo="Proprietário" />
          <CampoAuto tabela="propriedade" id={id} campo="proprietario_telefone" valor={p.proprietario_telefone} rotulo="Telefone / WhatsApp" tipo="tel" inputMode="tel" />
          <CampoAuto tabela="propriedade" id={id} campo="proprietario_email" valor={p.proprietario_email} rotulo="E-mail" tipo="email" inputMode="email" />
          <CampoAuto tabela="propriedade" id={id} campo="municipio" valor={p.municipio} rotulo="Município" />
          <label className="campo">
            UF
            <select value={p.uf ?? ''} onChange={(e) => void salvar('propriedade', { id, uf: e.target.value })}>
              <option value="">—</option>
              {UFS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
        </section>
      )}

      <section className="cartao" aria-labelledby="t-visitas">
        <h2 id="t-visitas">Visitas</h2>
        {visitas?.length === 0 && <p className="suave vazio">Nenhuma visita ainda.</p>}
        <ul className="lista-cartoes" style={{ marginTop: 12 }} aria-label="Visitas">
          {visitas?.map((v) => (
            <li key={v.id} className="cartao">
              <Link to={`/visitas/${v.id}`} className="cartao-link">
                <strong>{formatarData(v.data)}</strong>
                <span className="suave">{STATUS[v.status] ?? v.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Fab
        rotulo="Adicionar"
        acoes={[
          { rotulo: 'Nova visita', aoTocar: () => void criarVisita(id, hojeISO()).then((v) => navegar(`/visitas/${v}`)) },
          {
            rotulo: 'Novo animal',
            aoTocar: () => {
              setNovoAnimalAberto(true);
              requestAnimationFrame(() => document.getElementById('t-animais')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
            },
          },
        ]}
      />

      <section className="cartao" aria-labelledby="t-animais">
        <h2 id="t-animais">Animais ({animais?.length ?? 0})</h2>
        {novoAnimalAberto && (
          <form className="form-linha" style={{ alignItems: 'flex-end', marginTop: 12 }} onSubmit={novoAnimal} aria-label="Novo animal">
            <label className="campo" style={{ flex: '2 1 160px' }}>
              Identificação (número ou nome)
              <input name="identificacao" autoComplete="off" required autoFocus />
            </label>
            <label className="campo">
              Categoria
              <select name="categoria" defaultValue="Vaca em lactação">
                <option value="">—</option>
                {categorias?.map((c) => (
                  <option key={c.id}>{c.nome}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="botao botao-primario">Salvar animal</button>
            <button type="button" className="botao" onClick={() => setNovoAnimalAberto(false)}>Fechar</button>
          </form>
        )}
        {animais?.length === 0 && !novoAnimalAberto && <p className="suave vazio">Nenhum animal ainda.</p>}
        {aviso && <p className="aviso aviso-alerta" role="alert">{aviso}</p>}
        <ul className="lista-cartoes" style={{ marginTop: 12 }} aria-label="Animais">
          {animais?.map((a) => (
            <li key={a.id} className="cartao">
              <Link to={`/animais/${a.id}`} className="cartao-link">
                <strong>{a.identificacao}</strong>
                <span className="suave">{[a.categoria, a.raca].filter(Boolean).join(' · ') || '—'}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
