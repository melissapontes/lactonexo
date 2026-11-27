import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { carregarHistorico } from '../modules/mastite/historico';
import { hojeISO } from '../modules/mastite/dados';
import { avaliarRegras, comEstado, dispensarSugestao, nomeRegra, reabrirSugestao, regrasDoModulo, type EstadoSugestao, type Sugestao } from '../modules/mastite/regras';
import { FormConduta } from './Condutas';

export type SugestaoComEstado = Sugestao & { estado: EstadoSugestao };

/** Sugestões de uma propriedade (todas ou de um animal). Recalcula sozinho quando os dados mudam. */
export function useSugestoes(propriedadeId: string | undefined, animalId?: string) {
  return useLiveQuery(async () => {
    if (!propriedadeId) return [];
    const [regras, h] = await Promise.all([regrasDoModulo(), carregarHistorico(propriedadeId)]);
    const todas = avaliarRegras(regras, h, hojeISO());
    return comEstado(animalId ? todas.filter((s) => s.animal_id === animalId) : todas);
  }, [propriedadeId, animalId]);
}

const ROTULO_ESTADO: Record<EstadoSugestao, string> = {
  aberta: 'Aberta',
  dispensado: 'Dispensada',
  conduta_registrada: 'Conduta registrada',
};

/**
 * Lista de sugestões. Sempre SUGESTÃO: o vet decide, registra a conduta ou dispensa.
 */
export function ListaSugestoes({ sugestoes, mostrarAnimal = false }: { sugestoes: SugestaoComEstado[]; mostrarAnimal?: boolean }) {
  const [conduta, setConduta] = useState<string | null>(null);
  const [verRespondidas, setVerRespondidas] = useState(false);
  const abertas = sugestoes.filter((s) => s.estado === 'aberta');
  const respondidas = sugestoes.filter((s) => s.estado !== 'aberta');
  const lista = verRespondidas ? [...abertas, ...respondidas] : abertas;

  return (
    <div>
      {!abertas.length && <p className="suave">Nenhuma sugestão aberta.</p>}
      <ul className="lista-cartoes" aria-label="Sugestões">
        {lista.map((s) => (
          <li key={s.id} className="cartao" data-testid="sugestao" data-estado={s.estado}>
            <div className="topo-pagina" style={{ alignItems: 'flex-start' }}>
              <div>
                <span className={`selo ${s.estado === 'aberta' ? 'selo-alerta' : ''}`}>{s.estado === 'aberta' ? 'Sugestão' : ROTULO_ESTADO[s.estado]}</span>{' '}
                <span className="suave">{nomeRegra(s.tipo)}</span>
                <p style={{ margin: '6px 0 0' }}>
                  {mostrarAnimal && (
                    <>
                      <Link to={`/animais/${s.animal_id}`}><strong>{s.identificacao}</strong></Link>:{' '}
                    </>
                  )}
                  {s.mensagem}
                </p>
              </div>
            </div>
            {conduta === s.id ? (
              <FormConduta visitaAnimalId={s.visita_animal_id} origem={s} aoTerminar={() => setConduta(null)} />
            ) : s.estado === 'aberta' ? (
              <div className="form-linha" style={{ marginTop: 8 }}>
                <button type="button" className="botao botao-primario" onClick={() => setConduta(s.id)}>Registrar conduta</button>
                <button type="button" className="botao" onClick={() => void dispensarSugestao(s)}>Dispensar</button>
              </div>
            ) : (
              s.estado === 'dispensado' && (
                <div className="form-linha" style={{ marginTop: 8 }}>
                  <button type="button" className="botao" onClick={() => void reabrirSugestao(s)}>Reabrir</button>
                </div>
              )
            )}
          </li>
        ))}
      </ul>
      {respondidas.length > 0 && (
        <button type="button" className="botao" style={{ marginTop: 8 }} onClick={() => setVerRespondidas((v) => !v)} aria-expanded={verRespondidas}>
          {verRespondidas ? 'Ocultar respondidas' : `Ver respondidas (${respondidas.length})`}
        </button>
      )}
      <p className="suave" style={{ fontSize: '0.85rem' }}>As sugestões vêm das regras em Configurações. A decisão é sempre do veterinário.</p>
    </div>
  );
}
