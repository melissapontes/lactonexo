import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Conduta, Teto, TipoConduta } from '../db/tipos';
import { TETOS } from '../modules/mastite/constantes';
import { registrarConduta, type Sugestao } from '../modules/mastite/regras';
import { salvar } from '../sync/mutacoes';
import { formatarData } from '../lib/datas';
import { NOME_CONDUTA } from '../modules/mastite/condutas';

export { NOME_CONDUTA };

export function descreverConduta(c: Conduta) {
  return [
    NOME_CONDUTA[c.tipo] ?? c.tipo,
    c.teto,
    c.produto,
    c.dose,
    c.periodo,
    c.data_revisita ? `revisita ${formatarData(c.data_revisita)}` : '',
    c.observacao,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Formulário de conduta. Grava ao enviar (é um registro novo, não um campo). */
export function FormConduta({ visitaAnimalId, origem, aoTerminar }: { visitaAnimalId: string; origem?: Sugestao; aoTerminar?: () => void }) {
  const [tipo, setTipo] = useState<TipoConduta>(origem?.conduta_sugerida ?? 'tratamento');
  return (
    <form
      className="form"
      aria-label="Registrar conduta"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        const txt = (k: string) => String(f.get(k) ?? '').trim() || undefined;
        await registrarConduta(
          {
            visita_animal_id: visitaAnimalId,
            tipo,
            teto: (txt('teto') as Teto | undefined) ?? origem?.teto,
            produto: txt('produto'),
            dose: txt('dose'),
            periodo: txt('periodo'),
            data_revisita: txt('data_revisita'),
            observacao: txt('observacao'),
          },
          origem,
        );
        form.reset();
        aoTerminar?.();
      }}
    >
      {origem && <p className="suave" style={{ margin: 0 }}>Sugestão: {origem.mensagem}</p>}
      <div className="grade-campos">
        <label className="campo">
          Conduta
          <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoConduta)}>
            {Object.entries(NOME_CONDUTA).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="campo">
          Teto
          <select name="teto" defaultValue={origem?.teto ?? ''}>
            <option value="">Animal todo</option>
            {TETOS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        {(tipo === 'tratamento' || tipo === 'secagem' || tipo === 'outro') && (
          <>
            <label className="campo">
              Produto
              <input name="produto" autoComplete="off" />
            </label>
            <label className="campo">
              Dose
              <input name="dose" autoComplete="off" />
            </label>
          </>
        )}
        {(tipo === 'tratamento' || tipo === 'descarte_leite') && (
          <label className="campo">
            Período
            <input name="periodo" autoComplete="off" placeholder="ex.: 3 dias" />
          </label>
        )}
        {tipo === 'revisita' && (
          <label className="campo">
            Data da revisita
            <input name="data_revisita" type="date" required />
          </label>
        )}
        <label className="campo" style={{ gridColumn: '1 / -1' }}>
          Observação
          <input name="observacao" autoComplete="off" />
        </label>
      </div>
      <div className="form-linha">
        <button type="submit" className="botao botao-primario">Salvar conduta</button>
        {aoTerminar && (
          <button type="button" className="botao" onClick={aoTerminar}>Cancelar</button>
        )}
      </div>
    </form>
  );
}

/** Condutas registradas para o animal nesta visita, com o formulário para registrar outra. */
export function CondutasDaVisita({ visitaAnimalId }: { visitaAnimalId: string }) {
  const condutas = useLiveQuery(
    async () =>
      (await db.conduta.where('visita_animal_id').equals(visitaAnimalId).filter((c) => !c.excluido_em).toArray()).sort((a, b) =>
        a.criado_em.localeCompare(b.criado_em),
      ),
    [visitaAnimalId],
  );
  const [aberto, setAberto] = useState(false);
  return (
    <div>
      {condutas?.length ? (
        <ul className="lista-simples" aria-label="Condutas registradas">
          {condutas.map((c) => (
            <li key={c.id} className="form-linha" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{descreverConduta(c)}</span>
              <button type="button" className="botao" onClick={() => void salvar('conduta', { id: c.id, excluido_em: new Date().toISOString() })}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="suave">Nenhuma conduta registrada.</p>
      )}
      {aberto ? (
        <FormConduta visitaAnimalId={visitaAnimalId} aoTerminar={() => setAberto(false)} />
      ) : (
        <button type="button" className="botao" onClick={() => setAberto(true)}>Registrar conduta</button>
      )}
    </div>
  );
}
