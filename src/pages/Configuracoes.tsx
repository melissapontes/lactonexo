import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { APP, tituloPagina } from '../config/app';
import { db } from '../db/db';
import { formatarBytes, lerArmazenamento, pedirPersistencia, type InfoArmazenamento } from '../lib/armazenamento';
import { entregarArquivo, gerarBackup, nomeArquivoBackup, restaurarBackup, type ArquivoBackup } from '../lib/backup';
import { formatarDataHora } from '../lib/datas';
import { EditorCatalogo } from '../components/EditorCatalogo';
import { EditorRegras } from '../components/EditorRegras';
import { ConfigNotificacoes } from '../components/ConfigNotificacoes';
import { carregarExemploLaudo, exemploJaCarregado } from '../modules/mastite/seed-laudo';
import { useNavigate } from 'react-router-dom';
import { API_URL, sair } from '../sync/sessao';
import { useSessao } from '../sync/useSessao';

type Tema = 'auto' | 'claro' | 'escuro' | 'contraste';

function lerTema(): Tema {
  return (document.documentElement.dataset.tema as Tema) || 'auto';
}

function aplicarTema(t: Tema) {
  if (t === 'auto') delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = t;
  try {
    if (t === 'auto') localStorage.removeItem('lactonexo:tema');
    else localStorage.setItem('lactonexo:tema', t);
  } catch {
    /* preferência visual apenas */
  }
}

export function Configuracoes() {
  useEffect(() => {
    document.title = tituloPagina('Configurações');
  }, []);
  const [tema, setTema] = useState<Tema>(lerTema);
  const [arm, setArm] = useState<InfoArmazenamento | null>(null);
  const [msgBackup, setMsgBackup] = useState('');
  const navegar = useNavigate();
  const sessao = useSessao();
  const pendentes = useLiveQuery(() => db.fila_ops.count(), [], 0);
  const temExemplo = useLiveQuery(() => exemploJaCarregado(), [], true);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const rejeitadas = useLiveQuery(() => db.fila_ops.where('status').equals('rejeitada').toArray(), [], []);

  useEffect(() => {
    void lerArmazenamento().then(setArm);
  }, []);

  const pct = arm?.usadoBytes != null && arm.cotaBytes ? (arm.usadoBytes / arm.cotaBytes) * 100 : null;

  return (
    <main className="conteudo">
      <h1>Configurações</h1>

      {API_URL && sessao && (
        <section className="cartao" aria-labelledby="t-conta">
          <h2 id="t-conta">Conta</h2>
          <p>
            {sessao.usuario.nome} · {sessao.usuario.email} · {sessao.usuario.perfil === 'admin' ? 'Administrador' : 'Veterinário'}
          </p>
          <p className="suave">Sessão válida sem internet até {formatarDataHora(sessao.renovacao_expira_em)}.</p>
          <button
            type="button"
            className="botao"
            onClick={() => {
              if (pendentes > 0 && !window.confirm(`Há ${pendentes} alterações não sincronizadas. Elas continuam guardadas neste aparelho. Sair mesmo assim?`)) return;
              void sair();
            }}
          >
            Sair
          </button>
        </section>
      )}

      <section className="cartao" aria-labelledby="t-tema">
        <h2 id="t-tema">Aparência</h2>
        <div role="radiogroup" aria-labelledby="t-tema" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {(
            [
              ['auto', 'Automático'],
              ['claro', 'Claro'],
              ['escuro', 'Escuro'],
              ['contraste', 'Alto contraste (sol forte)'],
            ] as [Tema, string][]
          ).map(([v, rotulo]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={tema === v}
              className={`botao ${tema === v ? 'botao-primario' : ''}`}
              onClick={() => {
                aplicarTema(v);
                setTema(v);
              }}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="t-listas" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 id="t-listas">Listas</h2>
        <EditorCatalogo tipo="microrganismo" titulo="Microrganismos" />
        <EditorCatalogo tipo="antibiotico" titulo="Antibióticos" />
        <EditorCatalogo tipo="categoria" titulo="Categorias de animal" />
      </section>

      <ConfigNotificacoes />

      <EditorRegras editavel={!API_URL || sessao?.usuario.perfil === 'admin'} />

      {!temExemplo && (
        <section className="cartao">
          <h2>Dados de teste</h2>
          <p className="suave">
            Só para testar o app: cria uma propriedade de exemplo com a visita do laudo NAPROSA/UFPB de 29/09/2026
            (8 animais). Não muda nenhum campo nem lista; as visitas reais são preenchidas normalmente.
          </p>
          <button type="button" className="botao" onClick={async () => navegar(`/visitas/${await carregarExemploLaudo()}/resumo`)}>
            Carregar laudo de exemplo
          </button>
        </section>
      )}

      <section className="cartao" aria-labelledby="t-arm">
        <h2 id="t-arm">Armazenamento no aparelho</h2>
        <p>
          Armazenamento persistente:{' '}
          <strong>{arm?.persistente == null ? 'desconhecido' : arm.persistente ? 'ativo' : 'não concedido'}</strong>
        </p>
        <p>
          Em uso: <strong>{formatarBytes(arm?.usadoBytes ?? null)}</strong> de {formatarBytes(arm?.cotaBytes ?? null)}
          {pct != null && ` (${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`}
        </p>
        {pct != null && pct > 80 && (
          <p className="aviso aviso-erro">Espaço quase cheio. Sincronize e faça backup antes de tirar mais fotos.</p>
        )}
        {!arm?.persistente && (
          <button
            type="button"
            className="botao"
            onClick={async () => {
              await pedirPersistencia();
              setArm(await lerArmazenamento());
            }}
          >
            Pedir armazenamento persistente
          </button>
        )}
      </section>

      <section className="cartao" aria-labelledby="t-backup" id="backup">
        <h2 id="t-backup">Backup local</h2>
        <p className="suave">
          Gera um arquivo com tudo que está neste aparelho, inclusive o que ainda não foi sincronizado. Use quando ficar
          muitos dias sem sinal. Guarde no Arquivos, Drive ou envie para você mesmo.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="botao botao-primario"
            onClick={async () => {
              const b = await gerarBackup();
              await entregarArquivo(new Blob([JSON.stringify(b)], { type: 'application/json' }), nomeArquivoBackup());
              setMsgBackup('Backup gerado.');
            }}
          >
            Exportar backup (JSON)
          </button>
          <button type="button" className="botao" onClick={() => arquivoRef.current?.click()}>
            Restaurar de um arquivo
          </button>
          <input
            ref={arquivoRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const r = await restaurarBackup(JSON.parse(await f.text()) as ArquivoBackup);
                setMsgBackup(`Restaurado: ${r.registros} registro(s) e ${r.ops} alteração(ões) pendente(s). Nada foi apagado.`);
              } catch (err) {
                setMsgBackup(err instanceof Error ? err.message : 'Arquivo inválido.');
              }
            }}
          />
        </div>
        <p role="status" className="suave">{msgBackup}</p>
      </section>

      {rejeitadas.length > 0 && (
        <section className="cartao" aria-labelledby="t-rej" id="nao-sincronizadas">
          <h2 id="t-rej">Alterações não sincronizadas</h2>
          <p className="suave">O servidor recusou estas alterações. Elas continuam guardadas neste aparelho.</p>
          <ul>
            {rejeitadas.map((o) => (
              <li key={o.op_id}>
                {o.tabela} · {formatarDataHora(o.criada_em)} · {o.erro}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="suave">
        {APP.nome} · versão {__APP_VERSAO__}
      </p>
    </main>
  );
}
