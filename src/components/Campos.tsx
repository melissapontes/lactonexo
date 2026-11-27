import { useEffect, useRef, useState } from 'react';
import type { TabelaSync } from '../db/tipos';
import { salvar } from '../sync/mutacoes';

interface PropsCampo {
  tabela: TabelaSync;
  id: string;
  campo: string;
  valor: string | undefined | null;
  rotulo: string;
  tipo?: 'text' | 'tel' | 'email' | 'date';
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  lista?: string[];
  obrigatorio?: boolean;
}

/** Campo de texto com salvamento automático (ao parar de digitar e ao sair do campo). */
export function CampoAuto({ tabela, id, campo, valor, rotulo, tipo = 'text', inputMode, lista, obrigatorio }: PropsCampo) {
  const [v, setV] = useState(valor ?? '');
  const ultimo = useRef(valor ?? '');
  const timer = useRef<number>();
  const listaId = lista ? `lista-${tabela}-${campo}` : undefined;

  useEffect(() => {
    // Atualiza se outro aparelho/tela mudou o valor e o campo não está sendo editado.
    if (document.activeElement?.getAttribute('data-campo') !== `${id}:${campo}`) {
      setV(valor ?? '');
      ultimo.current = valor ?? '';
    }
  }, [valor, id, campo]);

  const gravar = (novo: string) => {
    window.clearTimeout(timer.current);
    const limpo = tipo === 'date' ? novo : novo.trim();
    if (limpo === ultimo.current) return;
    if (obrigatorio && !limpo) return;
    ultimo.current = limpo;
    void salvar(tabela, { id, [campo]: limpo || undefined });
  };

  return (
    <label className="campo">
      {rotulo}
      <input
        data-campo={`${id}:${campo}`}
        type={tipo}
        inputMode={inputMode}
        value={v}
        list={listaId}
        required={obrigatorio}
        autoComplete="off"
        onChange={(e) => {
          setV(e.target.value);
          window.clearTimeout(timer.current);
          const novo = e.target.value;
          timer.current = window.setTimeout(() => gravar(novo), 600);
        }}
        onBlur={(e) => gravar(e.target.value)}
      />
      {lista && (
        <datalist id={listaId}>
          {lista.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </label>
  );
}

/** Grupo de botões grandes para escolher um valor (sem digitação). */
export function Escolha<T extends string>({
  rotulo,
  opcoes,
  valor,
  aoEscolher,
  rotuloOpcao = (o) => o,
  classe = '',
  testid,
}: {
  rotulo: string;
  opcoes: readonly T[];
  valor: T | null | undefined;
  aoEscolher: (v: T) => void;
  rotuloOpcao?: (o: T) => string;
  classe?: string;
  testid?: string;
}) {
  return (
    <div className={`escolha ${classe}`} role="radiogroup" aria-label={rotulo} data-testid={testid}>
      {opcoes.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={valor === o}
          className={`botao escolha-op ${valor === o ? 'marcado' : ''}`}
          data-valor={o}
          onClick={() => aoEscolher(o)}
        >
          {rotuloOpcao(o)}
        </button>
      ))}
    </div>
  );
}
