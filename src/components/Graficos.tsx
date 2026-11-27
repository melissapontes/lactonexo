import { useState } from 'react';
import type { Cmt, Tamis } from '../db/tipos';
import { GRAUS_CMT, IMPRESSO_CMT } from '../modules/mastite/constantes';
import { formatarData } from '../lib/datas';
import { formatarPct } from '../modules/mastite/tabelas';
import './Graficos.css';

const dataCurta = (iso: string) => formatarData(iso).slice(0, 5);

/**
 * Evolução do CMT de um teto ao longo das visitas. Eixo y = graus (N a ++++).
 * Tamis positivo aparece como ponto maior com anel. Toque/foco no ponto mostra o valor.
 */
export function GraficoCmt({ titulo, pontos }: { titulo: string; pontos: { data: string; cmt: Cmt | null; tamis: Tamis | null }[] }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const L = 180;
  const A = 120;
  const m = { e: 34, d: 10, t: 10, b: 22 };
  const w = L - m.e - m.d;
  const h = A - m.t - m.b;
  const x = (i: number) => m.e + (pontos.length <= 1 ? w / 2 : (i * w) / (pontos.length - 1));
  const y = (c: Cmt) => m.t + h - (GRAUS_CMT.indexOf(c) * h) / (GRAUS_CMT.length - 1);
  const validos = pontos.map((p, i) => ({ ...p, i })).filter((p) => p.cmt);
  const caminho = validos.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.cmt!)}`).join(' ');
  const descricao = pontos.map((p) => `${formatarData(p.data)}: CMT ${p.cmt ?? 'não informado'}${p.tamis === 'positivo' ? ', Tamis positivo' : ''}`).join('; ');
  const sel = ativo != null ? pontos[ativo] : null;

  return (
    <figure>
      <figcaption>{titulo}</figcaption>
      <svg className="grafico" viewBox={`0 0 ${L} ${A}`} role="img" aria-label={`${titulo}. ${descricao}`}>
        {GRAUS_CMT.map((g) => (
          <g key={g}>
            <line className="grade" x1={m.e} x2={L - m.d} y1={y(g)} y2={y(g)} />
            {(g === 'N' || g === '++' || g === '++++') && (
              <text x={m.e - 6} y={y(g) + 4} textAnchor="end">{g}</text>
            )}
          </g>
        ))}
        {pontos.length > 0 && <text x={x(0)} y={A - 4} textAnchor={pontos.length > 1 ? 'start' : 'middle'}>{dataCurta(pontos[0].data)}</text>}
        {pontos.length > 1 && <text x={x(pontos.length - 1)} y={A - 4} textAnchor="end">{dataCurta(pontos.at(-1)!.data)}</text>}
        <path className="linha" d={caminho} stroke="var(--serie-1)" />
        {validos.map((p) => (
          <circle
            key={p.i}
            className="ponto"
            cx={x(p.i)}
            cy={y(p.cmt!)}
            r={p.tamis === 'positivo' ? 6 : 4}
            fill={p.tamis === 'positivo' ? 'var(--cor-erro)' : 'var(--serie-1)'}
          />
        ))}
        {pontos.map((p, i) => (
          <rect
            key={i}
            className="alvo"
            x={x(i) - 12}
            y={m.t - 6}
            width={24}
            height={h + 12}
            tabIndex={0}
            aria-label={`${formatarData(p.data)}: CMT ${p.cmt ?? 'não informado'}`}
            onPointerEnter={() => setAtivo(i)}
            onPointerLeave={() => setAtivo(null)}
            onFocus={() => setAtivo(i)}
            onBlur={() => setAtivo(null)}
            onClick={() => setAtivo(i)}
          />
        ))}
      </svg>
      <p className="suave" style={{ margin: 0, fontSize: '0.85rem', minHeight: '1.3em' }} aria-live="polite">
        {sel
          ? `${formatarData(sel.data)}: CMT ${sel.cmt ? IMPRESSO_CMT[sel.cmt] : '?'}${sel.tamis === 'positivo' ? ' · Tamis +' : ''}`
          : pontos.length
            ? `Última: CMT ${pontos.at(-1)!.cmt ? IMPRESSO_CMT[pontos.at(-1)!.cmt!] : '?'}`
            : ''}
      </p>
    </figure>
  );
}

/** Barras horizontais em HTML (responsivas, com rótulo e valor em texto). */
export function Barras({ itens, rotuloValor }: { itens: { rotulo: string; pct: number; n: number; italico?: boolean }[]; rotuloValor?: (i: { pct: number; n: number }) => string }) {
  const max = Math.max(100, ...itens.map((i) => i.pct));
  return (
    <ul className="barras">
      {itens.map((i) => {
        const valor = rotuloValor ? rotuloValor(i) : `${i.n} (${formatarPct(Math.round(i.pct * 10) / 10)})`;
        return (
          <li key={i.rotulo} title={`${i.rotulo}: ${valor}`}>
            <span className="topo">
              <span style={{ fontStyle: i.italico ? 'italic' : undefined }}>{i.rotulo}</span>
              <span>{valor}</span>
            </span>
            <span className="trilho" aria-hidden="true">
              <span className="barra" style={{ display: 'block', width: `${(i.pct / max) * 100}%` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Duas séries de % ao longo das visitas (clínica e subclínica).
 * Segunda série tracejada (não depende só da cor), legenda e rótulo direto no último ponto.
 */
export function GraficoPrevalencia({ datas, series }: { datas: string[]; series: { nome: string; valores: number[] }[] }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const L = 340;
  const A = 180;
  const m = { e: 40, d: 70, t: 12, b: 24 };
  const w = L - m.e - m.d;
  const h = A - m.t - m.b;
  const topo = Math.max(10, Math.ceil(Math.max(...series.flatMap((s) => s.valores)) / 10) * 10);
  const x = (i: number) => m.e + (datas.length <= 1 ? w / 2 : (i * w) / (datas.length - 1));
  const y = (v: number) => m.t + h - (v / topo) * h;
  const cores = ['var(--serie-1)', 'var(--serie-2)'];
  const tracos = [undefined, '6 4'];
  const marcas = [0, topo / 2, topo];

  return (
    <figure style={{ margin: 0 }}>
      <ul className="legenda">
        {series.map((s, k) => (
          <li key={s.nome}>
            <svg width="22" height="10" aria-hidden="true">
              <line x1="1" x2="21" y1="5" y2="5" stroke={cores[k]} strokeWidth="2" strokeDasharray={tracos[k]} />
            </svg>
            {s.nome}
          </li>
        ))}
      </ul>
      <svg
        className="grafico"
        viewBox={`0 0 ${L} ${A}`}
        role="img"
        aria-label={`Evolução por visita. ${series
          .map((s) => `${s.nome}: ${s.valores.map((v, i) => `${formatarData(datas[i])} ${formatarPct(Math.round(v * 10) / 10)}`).join(', ')}`)
          .join('. ')}`}
      >
        {marcas.map((v) => (
          <g key={v}>
            <line className="grade" x1={m.e} x2={L - m.d} y1={y(v)} y2={y(v)} />
            <text x={m.e - 6} y={y(v) + 4} textAnchor="end">{v}%</text>
          </g>
        ))}
        {datas.map((d, i) =>
          i === 0 || i === datas.length - 1 || datas.length <= 4 ? (
            <text key={d + i} x={x(i)} y={A - 6} textAnchor={datas.length === 1 ? 'middle' : i === 0 ? 'start' : i === datas.length - 1 ? 'end' : 'middle'}>
              {dataCurta(d)}
            </text>
          ) : null,
        )}
        {ativo != null && <line className="grade" x1={x(ativo)} x2={x(ativo)} y1={m.t} y2={m.t + h} />}
        {series.map((s, k) => (
          <g key={s.nome}>
            <path className="linha" d={s.valores.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')} stroke={cores[k]} strokeDasharray={tracos[k]} />
            {s.valores.map((v, i) => (
              <circle key={i} className="ponto" cx={x(i)} cy={y(v)} r={4} fill={cores[k]} />
            ))}
            <text className="rotulo-forte" x={x(s.valores.length - 1) + 8} y={y(s.valores.at(-1) ?? 0) + 4 + (k ? 8 : -2)}>
              {formatarPct(Math.round((s.valores.at(-1) ?? 0) * 10) / 10)}
            </text>
          </g>
        ))}
        {datas.map((_, i) => (
          <rect
            key={i}
            className="alvo"
            x={x(i) - 14}
            y={m.t}
            width={28}
            height={h}
            onPointerEnter={() => setAtivo(i)}
            onPointerLeave={() => setAtivo(null)}
            onClick={() => setAtivo(i)}
          />
        ))}
      </svg>
      <p className="suave" style={{ margin: 0, fontSize: '0.85rem', minHeight: '1.3em' }} aria-live="polite">
        {ativo != null
          ? `${formatarData(datas[ativo])}: ${series.map((s) => `${s.nome} ${formatarPct(Math.round(s.valores[ativo] * 10) / 10)}`).join(' · ')}`
          : 'Toque em uma visita para ver os valores.'}
      </p>
    </figure>
  );
}
