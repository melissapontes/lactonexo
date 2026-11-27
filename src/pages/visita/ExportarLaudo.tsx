import { useState } from 'react';
import { APP } from '../../config/app';
import { formatarData } from '../../lib/datas';
import { baixar, compartilharOuBaixar, linkEmail, linkWhatsApp } from '../../lib/compartilhar';
import { gerarCsv, gerarXlsx, nomeArquivo, TIPO_CSV, TIPO_XLSX } from '../../lib/planilha';
import { abasDaVisita, linhasLaudo } from '../../modules/mastite/exportar';
import type { Laudo } from '../../modules/mastite/laudo';
import { salvar } from '../../sync/mutacoes';

/** Ações do laudo: PDF (baixar ou enviar ao produtor) e planilhas. Tudo gerado no aparelho, sem internet. */
export function ExportarLaudo({ laudo }: { laudo: Laudo }) {
  const [estado, setEstado] = useState<'' | 'gerando' | 'baixado' | 'enviado'>('');
  const [erro, setErro] = useState('');
  const p = laudo.propriedade;
  const base = ['Laudo', p?.nome ?? '', laudo.visita.data];
  const assunto = `Laudo ${p?.nome ?? ''} ${formatarData(laudo.visita.data)}`.trim();
  const mensagem = `Olá${p?.proprietario_nome ? `, ${p.proprietario_nome}` : ''}. Segue o laudo da visita de ${formatarData(laudo.visita.data)} (${p?.nome ?? ''}), enviado pelo ${APP.nome}.`;

  async function pdf(): Promise<Blob> {
    setErro('');
    setEstado('gerando');
    // Carrega o gerador só quando precisa (deixa a abertura do app mais leve).
    const { gerarPdfLaudo, logoComoPng } = await import('../../modules/mastite/pdf');
    return gerarPdfLaudo(laudo, { logoPng: await logoComoPng() });
  }

  async function marcarEnviado() {
    if (laudo.visita.status !== 'laudo_enviado') await salvar('visita', { id: laudo.visita.id, status: 'laudo_enviado' });
  }

  return (
    <section className="cartao" aria-labelledby="t-exportar">
      <h2 id="t-exportar">Laudo em PDF e planilhas</h2>
      <div className="form-linha" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="botao botao-primario"
          disabled={estado === 'gerando'}
          onClick={async () => {
            try {
              const r = await compartilharOuBaixar(await pdf(), nomeArquivo(base, 'pdf'), mensagem);
              if (r === 'compartilhado') {
                await marcarEnviado();
                setEstado('enviado');
              } else setEstado(r === 'baixado' ? 'baixado' : '');
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível gerar o PDF.');
              setEstado('');
            }
          }}
        >
          {estado === 'gerando' ? 'Gerando PDF…' : 'Enviar laudo (PDF)'}
        </button>
        <button
          type="button"
          className="botao"
          disabled={estado === 'gerando'}
          onClick={async () => {
            try {
              baixar(await pdf(), nomeArquivo(base, 'pdf'));
              setEstado('baixado');
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível gerar o PDF.');
              setEstado('');
            }
          }}
        >
          Baixar PDF
        </button>
        <button type="button" className="botao" onClick={() => baixar(new Blob([gerarXlsx(abasDaVisita(laudo))], { type: TIPO_XLSX }), nomeArquivo(base, 'xlsx'))}>
          Excel
        </button>
        <button type="button" className="botao" onClick={() => baixar(new Blob([gerarCsv(linhasLaudo(laudo))], { type: TIPO_CSV }), nomeArquivo(base, 'csv'))}>
          CSV
        </button>
      </div>

      {estado === 'enviado' && (
        <p className="aviso" role="status">Laudo compartilhado. A visita foi marcada como "Laudo enviado".</p>
      )}
      {estado === 'baixado' && (
        <div className="aviso" role="status" data-testid="aviso-baixado">
          <p style={{ margin: 0 }}>PDF salvo no aparelho. Para enviar ao produtor, anexe o arquivo:</p>
          <div className="form-linha" style={{ marginTop: 8 }}>
            <a className="botao" href={linkWhatsApp(mensagem, p?.proprietario_telefone)} target="_blank" rel="noreferrer">Abrir WhatsApp</a>
            <a className="botao" href={linkEmail(assunto, mensagem, p?.proprietario_email)}>Abrir e-mail</a>
            {laudo.visita.status !== 'laudo_enviado' && (
              <button type="button" className="botao" onClick={() => void marcarEnviado().then(() => setEstado('enviado'))}>
                Marcar como enviado
              </button>
            )}
          </div>
        </div>
      )}
      {erro && <p className="aviso aviso-alerta" role="alert">{erro}</p>}
      <p className="suave" style={{ fontSize: '0.85rem', marginBottom: 0 }}>
        Excel traz o laudo, as Tabelas 1 a 3 e os antibiogramas em abas. CSV traz a tabela por animal e teto.
      </p>
    </section>
  );
}
