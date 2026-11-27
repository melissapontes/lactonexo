import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/db';
import { gerarBackup, nomeArquivoBackup, restaurarBackup } from '../../src/lib/backup';
import { definirSessao, salvar } from '../../src/sync/mutacoes';
import { bancoNovo } from './ajuda';

describe('backup local', () => {
  beforeEach(async () => {
    await bancoNovo();
    definirSessao('vet-1', 'org-1');
  });

  it('exporta e restaura em outro aparelho sem perder pendências', async () => {
    await salvar('propriedade', { nome: 'Logradouro' });
    await salvar('animal', { propriedade_id: 'p', identificacao: 'Maravilha 262', ativo: true });
    const b = JSON.parse(JSON.stringify(await gerarBackup()));
    expect(b.app).toBe('LactoNexo');

    await bancoNovo();
    const r = await restaurarBackup(b);
    expect(r).toEqual({ registros: 2, ops: 2 });
    expect((await db.animal.toArray())[0].identificacao).toBe('Maravilha 262');
    expect(await db.fila_ops.count()).toBe(2);

    // Restaurar de novo não duplica nada.
    expect(await restaurarBackup(b)).toEqual({ registros: 0, ops: 0 });
  });

  it('não sobrescreve registro local mais novo', async () => {
    const id = await salvar('propriedade', { nome: 'Antigo' });
    const b = JSON.parse(JSON.stringify(await gerarBackup()));
    await new Promise((r) => setTimeout(r, 5));
    await salvar('propriedade', { id, nome: 'Novo' });
    await restaurarBackup(b);
    expect((await db.propriedade.get(id))?.nome).toBe('Novo');
  });

  it('recusa arquivo que não é do LactoNexo', async () => {
    await expect(restaurarBackup({ app: 'Outro' } as never)).rejects.toThrow();
  });

  it('nome do arquivo tem data', () => {
    expect(nomeArquivoBackup(new Date(2026, 8, 29, 14, 5))).toBe('lactonexo-backup-20260929-1405.json');
  });
});
