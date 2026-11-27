import { describe, expect, it } from 'vitest';
import { compararHlc, hlcDeTexto, hlcParaTexto, receber, tick } from '../../src/sync/hlc';

describe('HLC', () => {
  const base = { ms: 1000, contador: 0, dispositivo: 'a' };

  it('avança com o relógio quando ele anda para frente', () => {
    expect(tick(base, 2000)).toEqual({ ms: 2000, contador: 0, dispositivo: 'a' });
  });

  it('incrementa o contador quando o relógio volta para trás (celular com hora errada)', () => {
    const t1 = tick(base, 500);
    expect(t1).toEqual({ ms: 1000, contador: 1, dispositivo: 'a' });
    expect(compararHlc(hlcParaTexto(t1), hlcParaTexto(base))).toBe(1);
  });

  it('o texto ordena igual ao tempo', () => {
    const a = hlcParaTexto({ ms: 999, contador: 9, dispositivo: 'z' });
    const b = hlcParaTexto({ ms: 1000, contador: 0, dispositivo: 'a' });
    expect(compararHlc(a, b)).toBe(-1);
  });

  it('ida e volta do texto preserva o dispositivo com hífens (UUID)', () => {
    const h = { ms: 123, contador: 4, dispositivo: '1b83db7a-b17f-4329' };
    expect(hlcDeTexto(hlcParaTexto(h))).toEqual(h);
  });

  it('ao receber carimbo remoto mais novo, passa a frente dele', () => {
    const r = receber(base, { ms: 5000, contador: 3, dispositivo: 'srv' }, 1500);
    expect(r).toEqual({ ms: 5000, contador: 4, dispositivo: 'a' });
  });
});
