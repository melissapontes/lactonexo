import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { TabelaSync } from '../db/tipos';
import { adicionarFoto } from '../lib/fotos';
import { excluir } from '../sync/mutacoes';

function Miniatura({ fotoId, progresso }: { fotoId: string; progresso: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let u: string | undefined;
    void db.arquivo_foto.get(fotoId).then((a) => {
      if (a) setUrl((u = URL.createObjectURL(a.blob)));
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [fotoId]);
  return (
    <figure className="foto">
      {url ? <img src={url} alt="Foto do teto" /> : <span className="suave">foto</span>}
      <figcaption>{progresso}</figcaption>
    </figure>
  );
}

/** Fotos ligadas a um registro: câmera (ou galeria), compressão no aparelho e fila de envio com progresso. */
export function FotosDo({ tabela, id }: { tabela: TabelaSync; id: string }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState('');
  const [processando, setProcessando] = useState(false);
  const fotos = useLiveQuery(
    () => db.foto.where('[dono_tabela+dono_id]').equals([tabela, id]).filter((f) => !f.excluido_em).toArray(),
    [tabela, id],
  );
  return (
    <div className="fotos">
      <div className="fotos-lista">
        {fotos?.map((f) => (
          <div key={f.id} className="foto-item">
            <Miniatura
              fotoId={f.id}
              progresso={
                f.envio === 'enviada' ? '✓ enviada' : f.envio === 'enviando' ? `enviando ${Math.round(((f.bytes_enviados ?? 0) / (f.bytes || 1)) * 100)}%` : 'na fila'
              }
            />
            <button type="button" className="botao" aria-label="Remover foto" onClick={() => void excluir('foto', f.id)}>✕</button>
          </div>
        ))}
      </div>
      <button type="button" className="botao" disabled={processando} onClick={() => entrada.current?.click()}>
        {processando ? 'Comprimindo…' : 'Tirar foto'}
      </button>
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={async (e) => {
          const arquivo = e.target.files?.[0];
          e.target.value = '';
          if (!arquivo) return;
          setProcessando(true);
          setErro('');
          try {
            await adicionarFoto(tabela, id, arquivo);
          } catch (err) {
            setErro(err instanceof Error ? err.message : 'Não foi possível guardar a foto.');
          } finally {
            setProcessando(false);
          }
        }}
      />
      {erro && <p className="aviso aviso-erro" role="alert">{erro}</p>}
    </div>
  );
}
