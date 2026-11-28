import { useState } from 'react';
import { APP } from '../config/app';
import { instalarApp, useInstalar } from '../lib/instalar';

/** Seção "Instalar o app" em Configurações: o lugar fixo para instalar depois de fechar a faixa do topo. */
export function ConfigInstalar() {
  const { ios, instalado, podeInstalar } = useInstalar();
  const [recusou, setRecusou] = useState(false);

  return (
    <section className="cartao" aria-labelledby="t-instalar" id="instalar" data-testid="config-instalar">
      <h2 id="t-instalar">Instalar o app</h2>
      {instalado ? (
        <p className="suave">O {APP.nome} já está instalado neste aparelho.</p>
      ) : ios ? (
        <>
          <p className="suave">No iPhone ou iPad, instale pelo Safari:</p>
          <ol>
            <li>Toque em <strong>Compartilhar</strong> (quadrado com seta para cima).</li>
            <li>Toque em <strong>Adicionar à Tela de Início</strong>.</li>
            <li>Abra o {APP.nome} pelo ícone novo.</li>
          </ol>
        </>
      ) : (
        <>
          <p className="suave">
            Instalado, o {APP.nome} abre pelo ícone, como um app comum, e guarda os dados com mais segurança para usar sem
            internet.
          </p>
          {podeInstalar ? (
            <button
              type="button"
              className="botao botao-primario"
              onClick={async () => setRecusou(!(await instalarApp()))}
            >
              Instalar
            </button>
          ) : (
            <p className="suave">
              Se o botão não aparecer, use o menu do navegador (⋮ no Chrome ou … no Edge) e escolha{' '}
              <strong>Instalar {APP.nome}</strong> ou <strong>Adicionar à tela inicial</strong>.
            </p>
          )}
          {recusou && <p className="suave">Tudo bem, dá para instalar depois por aqui.</p>}
        </>
      )}
    </section>
  );
}
