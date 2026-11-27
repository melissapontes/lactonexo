import { useLiveQuery } from 'dexie-react-hooks';
import type { Cmt, Regra } from '../db/tipos';
import { GRAUS_CMT } from '../modules/mastite/constantes';
import { nomeRegra, parametrosDe, regrasDoModulo } from '../modules/mastite/regras';
import { salvar } from '../sync/mutacoes';

const DESCRICAO: Record<string, string> = {
  cmt_consecutivo: 'Sugere atenção ao teto com CMT alto em visitas seguidas do animal.',
  agente_recorrente: 'Sugere atenção quando o mesmo agente volta a ser isolado no animal.',
  resistencia: 'Avisa quando o antibiograma do animal mostra resistência a um antibiótico.',
  revisita: 'Sugere revisita após Tamis positivo ou CMT alto, e lembra revisitas marcadas na conduta.',
};

function Numero({ regra, campo, rotulo, opcoes, editavel }: { regra: Regra; campo: string; rotulo: string; opcoes: number[]; editavel: boolean }) {
  const p = parametrosDe(regra) as unknown as Record<string, number>;
  const lista = opcoes.includes(p[campo]) ? opcoes : [...opcoes, p[campo]].sort((x, y) => x - y);
  return (
    <label className="campo">
      {rotulo}
      <select value={p[campo]} disabled={!editavel} onChange={(e) => void salvar('regra', { id: regra.id, parametros: { ...p, [campo]: Number(e.target.value) } })}>
        {lista.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </label>
  );
}

const faixa = (de: number, ate: number) => Array.from({ length: ate - de + 1 }, (_, i) => de + i);

function Grau({ regra, editavel }: { regra: Regra; editavel: boolean }) {
  const p = parametrosDe(regra) as unknown as Record<string, unknown>;
  return (
    <label className="campo">
      CMT mínimo
      <select
        value={String(p.grau_minimo)}
        disabled={!editavel}
        onChange={(e) => void salvar('regra', { id: regra.id, parametros: { ...p, grau_minimo: e.target.value as Cmt } })}
      >
        {GRAUS_CMT.filter((g) => g !== 'N').map((g) => (
          <option key={g}>{g}</option>
        ))}
      </select>
    </label>
  );
}

/** Regras de apoio à decisão. Com servidor, só o administrador altera (o servidor recusa o resto). */
export function EditorRegras({ editavel }: { editavel: boolean }) {
  const regras = useLiveQuery(regrasDoModulo, []);
  return (
    <section className="cartao" aria-labelledby="t-regras">
      <h2 id="t-regras">Regras de apoio à decisão</h2>
      <p className="suave" style={{ marginTop: 4 }}>
        As regras geram sugestões para o veterinário. Nada é decidido automaticamente.
        {!editavel && ' Só o administrador pode alterar as regras.'}
      </p>
      <ul className="lista-cartoes">
        {regras?.map((r) => {
          const p = parametrosDe(r) as unknown as Record<string, unknown>;
          return (
            <li key={r.id} className="cartao" data-testid={`regra-${r.tipo}`}>
              <label className="form-linha" style={{ alignItems: 'center', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={r.ativa}
                  disabled={!editavel}
                  onChange={(e) => void salvar('regra', { id: r.id, ativa: e.target.checked })}
                  style={{ width: 24, height: 24 }}
                />
                {nomeRegra(r.tipo)}
              </label>
              <p className="suave" style={{ margin: '4px 0 8px' }}>{DESCRICAO[r.tipo]}</p>
              <div className="grade-campos">
                {r.tipo === 'cmt_consecutivo' && (
                  <>
                    <Grau regra={r} editavel={editavel} />
                    <Numero regra={r} campo="visitas" rotulo="Visitas seguidas" opcoes={faixa(2, 10)} editavel={editavel} />
                  </>
                )}
                {r.tipo === 'agente_recorrente' && (
                  <>
                    <Numero regra={r} campo="vezes" rotulo="Isolado em pelo menos (visitas)" opcoes={faixa(2, 10)} editavel={editavel} />
                    <Numero regra={r} campo="ultimas_visitas" rotulo="Nas últimas (visitas)" opcoes={faixa(2, 20)} editavel={editavel} />
                  </>
                )}
                {r.tipo === 'resistencia' && (
                  <label className="form-linha" style={{ alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(p.incluir_intermediario)}
                      disabled={!editavel}
                      onChange={(e) => void salvar('regra', { id: r.id, parametros: { ...p, incluir_intermediario: e.target.checked } })}
                      style={{ width: 24, height: 24 }}
                    />
                    Incluir Intermediário
                  </label>
                )}
                {r.tipo === 'revisita' && (
                  <>
                    <Grau regra={r} editavel={editavel} />
                    <Numero regra={r} campo="dias" rotulo="Revisitar em (dias)" opcoes={[3, 5, 7, 10, 14, 21, 30, 45, 60, 90]} editavel={editavel} />
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
