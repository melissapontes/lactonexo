import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { TipoCatalogo } from '../db/tipos';
import { itensCatalogo } from '../modules/mastite/dados';
import { salvar } from '../sync/mutacoes';
import { CampoAuto } from './Campos';

/** Lista editável. O texto é salvo exatamente como digitado; itens desativados somem das escolhas, mas os registros antigos continuam. */
export function EditorCatalogo({ tipo, titulo }: { tipo: TipoCatalogo; titulo: string }) {
  const itens = useLiveQuery(() => itensCatalogo(tipo, true), [tipo]);
  const [novo, setNovo] = useState('');
  return (
    <details className="cartao">
      <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', fontWeight: 700, cursor: 'pointer' }}>
        {titulo} ({itens?.filter((i) => i.ativo).length ?? 0})
      </summary>
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {itens?.map((i) => (
          <li key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', opacity: i.ativo ? 1 : 0.6 }}>
            <div style={{ flex: 1 }}>
              <CampoAuto tabela="catalogo_item" id={i.id} campo="nome" valor={i.nome} rotulo={i.ativo ? 'Nome' : 'Nome (desativado)'} obrigatorio />
            </div>
            <button type="button" className="botao" onClick={() => void salvar('catalogo_item', { id: i.id, ativo: !i.ativo })}>
              {i.ativo ? 'Desativar' : 'Reativar'}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="form-linha"
        style={{ alignItems: 'flex-end' }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!novo.trim()) return;
          await salvar('catalogo_item', { tipo, nome: novo.trim(), ordem: (itens?.length ?? 0) + 1, ativo: true });
          setNovo('');
        }}
      >
        <label className="campo" style={{ flex: '2 1 200px' }}>
          Novo item
          <input value={novo} onChange={(e) => setNovo(e.target.value)} autoComplete="off" />
        </label>
        <button type="submit" className="botao">Adicionar</button>
      </form>
    </details>
  );
}
