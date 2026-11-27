import { BancoLactoNexo, usarBanco } from '../../src/db/db';
import { reiniciarRelogio } from '../../src/sync/mutacoes';
import { uuid } from '../../src/lib/uuid';

export async function bancoNovo() {
  const b = new BancoLactoNexo('teste-' + uuid());
  await b.open();
  usarBanco(b);
  reiniciarRelogio();
  return b;
}
