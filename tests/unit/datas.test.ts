import { describe, expect, it } from 'vitest';
import { formatarData } from '../../src/lib/datas';

describe('datas dd/mm/aaaa', () => {
  it('data pura não sofre fuso horário', () => {
    expect(formatarData('2026-09-29')).toBe('29/09/2026');
  });
});
