import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { Cmt, ExameTeto, Tamis, Teto } from '../../db/tipos';
import { Escolha } from '../../components/Campos';
import { GRAUS_CMT, IMPRESSO_CMT, IMPRESSO_TAMIS, NOME_TETO, TETOS } from '../../modules/mastite/constantes';
import { registrarTubo } from '../../modules/mastite/dados';
import { salvar } from '../../sync/mutacoes';
import { FotosDo } from '../../components/Fotos';
import { CabecalhoVisita } from './CabecalhoVisita';
import { CondutasDaVisita } from '../../components/Condutas';
import './AnimalVisita.css';

const rotuloLinha = (e: ExameTeto) => e.posicao ?? `Teto ${e.linha}`;

/**
 * Preenchimento rápido, com uma mão: esquema dos 4 tetos e botões grandes de Tamis e CMT.
 * Ao escolher o CMT, passa sozinho para o próximo teto. Cada toque é salvo na hora.
 */
export function AnimalVisita() {
  const { id = '', va = '' } = useParams();
  const visitaAnimal = useLiveQuery(() => db.visita_animal.get(va), [va]);
  const animal = useLiveQuery(() => (visitaAnimal ? db.animal.get(visitaAnimal.animal_id) : undefined), [visitaAnimal?.animal_id]);
  const exames = useLiveQuery(
    async () => (await db.exame_teto.where('visita_animal_id').equals(va).filter((e) => !e.excluido_em).toArray()).sort((a, b) => a.linha - b.linha),
    [va],
  );
  const vizinhos = useLiveQuery(async () => {
    const todos = (await db.visita_animal.where('visita_id').equals(id).filter((x) => !x.excluido_em).toArray()).sort((a, b) => a.ordem - b.ordem);
    const i = todos.findIndex((x) => x.id === va);
    return { anterior: todos[i - 1]?.id, proximo: todos[i + 1]?.id };
  }, [id, va]);
  const tubos = useLiveQuery(async () => {
    const ids = new Set(exames?.map((e) => e.id));
    const origens = (await db.amostra_origem.filter((o) => !o.excluido_em && ids.has(o.exame_teto_id)).toArray());
    const amostras = await db.amostra.bulkGet([...new Set(origens.map((o) => o.amostra_id))]);
    return amostras
      .filter((a) => a && !a.excluido_em)
      .map((a) => ({ ...a!, exames: origens.filter((o) => o.amostra_id === a!.id).map((o) => o.exame_teto_id) }));
  }, [exames]);

  const [sel, setSel] = useState(0);
  const [tubo, setTubo] = useState('');
  const [avisoTubo, setAvisoTubo] = useState('');
  useEffect(() => {
    setSel(0);
  }, [va]);

  if (!exames || !visitaAnimal) return <main className="conteudo">Carregando…</main>;
  const atual = exames[sel];

  const marcar = async (campos: Partial<Pick<ExameTeto, 'tamis' | 'cmt'>>, avancar = false) => {
    await salvar('exame_teto', { id: atual.id, ...campos });
    if (avancar && sel < exames.length - 1) setSel(sel + 1);
  };

  const tudoNegativo = async () => {
    for (const e of exames) await salvar('exame_teto', { id: e.id, tamis: e.tamis ?? 'negativo', cmt: e.cmt ?? 'N' });
  };

  const coletar = async (composto: boolean) => {
    if (!tubo.trim()) return;
    const r = await registrarTubo(id, tubo, composto ? exames.map((e) => e.id) : [atual.id], composto ? 'composto' : 'teto');
    if (r.duplicado) setAvisoTubo(`O tubo ${tubo} já existe nesta visita. Use outro número.`);
    else {
      setAvisoTubo('');
      setTubo('');
    }
  };

  const tubosDoTeto = (exameId: string) => tubos?.filter((t) => t.tipo === 'teto' && t.exames.includes(exameId)) ?? [];
  const compostos = tubos?.filter((t) => t.tipo === 'composto') ?? [];
  const semRotulo = exames.some((e) => !e.posicao);

  return (
    <main className="conteudo">
      <CabecalhoVisita visitaId={id} pagina={animal?.identificacao ?? 'Animal'} />
      <div className="topo-pagina">
        <h2 style={{ fontSize: '1.4rem' }}>
          {visitaAnimal.ordem}. {animal?.identificacao}
        </h2>
        <button type="button" className="botao" onClick={() => void tudoNegativo()}>
          Restantes negativos
        </button>
      </div>

      <div className="tetos" role="group" aria-label="Tetos">
        {exames.map((e, i) => (
          <button
            key={e.id}
            type="button"
            className={`teto ${i === sel ? 'ativo' : ''} ${e.tamis === 'positivo' || (e.cmt && ['++', '+++', '++++'].includes(e.cmt)) ? 'alterado' : ''}`}
            aria-pressed={i === sel}
            aria-label={`${e.posicao ? NOME_TETO[e.posicao] : `Teto ${e.linha} sem rótulo`}: Tamis ${e.tamis ?? 'não informado'}, CMT ${e.cmt ?? 'não informado'}`}
            onClick={() => setSel(i)}
            data-testid={`teto-${rotuloLinha(e)}`}
          >
            <span className="teto-nome">{rotuloLinha(e)}</span>
            <span className="teto-valores">
              <span>Tamis {e.tamis ? IMPRESSO_TAMIS[e.tamis] : '?'}</span>
              <span>CMT {e.cmt ? IMPRESSO_CMT[e.cmt] : '?'}</span>
            </span>
            {tubosDoTeto(e.id).map((t) => (
              <span key={t.id} className="selo">tubo {t.numero_tubo}</span>
            ))}
          </button>
        ))}
      </div>

      <section className="cartao painel-teto" aria-label={`Teto ${rotuloLinha(atual)}`}>
        <h3>{atual.posicao ? `${atual.posicao} · ${NOME_TETO[atual.posicao]}` : `Teto ${atual.linha} (sem rótulo)`}</h3>
        {semRotulo && (
          <Escolha<Teto>
            rotulo="Posição do teto"
            opcoes={TETOS}
            valor={atual.posicao}
            aoEscolher={(posicao) => void salvar('exame_teto', { id: atual.id, posicao })}
          />
        )}
        <p className="rotulo-grupo">Tamis (caneca)</p>
        <Escolha<Tamis>
          rotulo="Tamis"
          opcoes={['negativo', 'positivo']}
          valor={atual.tamis}
          rotuloOpcao={(o) => (o === 'negativo' ? 'Negativo' : 'Positivo')}
          aoEscolher={(tamis) => void marcar({ tamis })}
          classe="escolha-2"
          testid="tamis"
        />
        <p className="rotulo-grupo">CMT</p>
        <Escolha<Cmt> rotulo="CMT" opcoes={GRAUS_CMT} valor={atual.cmt} aoEscolher={(cmt) => void marcar({ cmt }, true)} classe="escolha-cmt" testid="cmt" />

        <p className="rotulo-grupo">Coleta de amostra</p>
        <div className="form-linha" style={{ alignItems: 'flex-end' }}>
          <label className="campo" style={{ flex: '1 1 100px' }}>
            Nº do tubo
            <input inputMode="numeric" value={tubo} onChange={(e) => setTubo(e.target.value)} autoComplete="off" />
          </label>
          <button type="button" className="botao" disabled={!tubo.trim()} onClick={() => void coletar(false)}>
            Tubo deste teto
          </button>
          <button type="button" className="botao" disabled={!tubo.trim()} onClick={() => void coletar(true)}>
            Tubo composto
          </button>
        </div>
        {avisoTubo && <p className="aviso aviso-alerta" role="alert">{avisoTubo}</p>}

        <p className="rotulo-grupo">Fotos do teto</p>
        <FotosDo tabela="exame_teto" id={atual.id} />
        {compostos.length > 0 && <p className="suave">Composto: {compostos.map((c) => `tubo ${c.numero_tubo}`).join(', ')}</p>}
      </section>

      <section className="cartao" aria-labelledby="t-conduta">
        <h3 id="t-conduta">Conduta</h3>
        <CondutasDaVisita visitaAnimalId={va} />
        {animal && (
          <p className="suave" style={{ marginBottom: 0 }}>
            <Link to={`/animais/${animal.id}`}>Histórico e sugestões de {animal.identificacao}</Link>
          </p>
        )}
      </section>

      <nav className="topo-pagina" aria-label="Outros animais">
        {vizinhos?.anterior ? <Link className="botao" to={`/visitas/${id}/animal/${vizinhos.anterior}`}>‹ Animal anterior</Link> : <span />}
        {vizinhos?.proximo ? (
          <Link className="botao botao-primario" to={`/visitas/${id}/animal/${vizinhos.proximo}`}>Próximo animal ›</Link>
        ) : (
          <Link className="botao botao-primario" to={`/visitas/${id}`}>Voltar à lista</Link>
        )}
      </nav>
    </main>
  );
}
