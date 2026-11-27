# Laudo em PDF e exportações

Tudo é gerado **no aparelho**, sem internet. O gerador de PDF é carregado só quando o vet toca no botão e fica no cache do app (service worker), então funciona offline depois da primeira abertura.

## PDF do laudo (tela Resumo da visita)
Mesmo formato do modelo:
1. Cabeçalho cinza com instituição, propriedade, município, proprietário e data; logo e nome do app à direita (`APP` em `src/config/app.ts` e `public/logo.svg`).
2. "Laudo" e a tabela por animal: nº, ANIMAL, TUBO, Teto, Tamis, CMT e Resultado (agentes em negrito itálico, "Sem crescimento" em negrito). Negativo sai como "-".
3. Nota 1 (legenda do CMT).
4. Tabelas 1 a 3 com Número e %.
5. ANTIBIOGRAMA: uma tabela por antibiograma, com "amostra N" ou "amostra 8 e 9 (pool)".
6. Rodapé com "Laudo emitido pelo LactoNexo em dd/mm/aaaa" e número da página.

Os nomes saem exatamente como cadastrados (inclusive "Streptococcus aureus"). Código: `src/modules/mastite/pdf.ts` (jsPDF + jspdf-autotable).

### Enviar ao produtor
- **Enviar laudo (PDF)**: no iPhone e no Android abre a folha de compartilhamento do sistema, que leva o PDF ao WhatsApp, Mail etc. Quando o compartilhamento termina, a visita passa para "Laudo enviado".
- Sem compartilhamento de arquivos (computador): o PDF é baixado e o app mostra **Abrir WhatsApp** (com o telefone do proprietário, se cadastrado) e **Abrir e-mail** (com o e-mail do proprietário), para anexar o arquivo, e o botão **Marcar como enviado**.
- **Baixar PDF**: só salva o arquivo.

## Planilhas
| Onde | Excel (.xlsx) | CSV |
|---|---|---|
| Resumo da visita | Abas: Laudo, Tabelas 1 a 3, Antibiogramas, Cabeçalho | Tabela por animal e teto |
| Painel da propriedade | Abas: Exames por teto (todas as visitas), Antibiogramas, Condutas, Culturas | Exames por teto |

- CSV no padrão do Excel em português: separador `;`, vírgula decimal, UTF-8 com BOM (acentos abrem certo).
- Percentuais vão como número de 0 a 100. O XLSX é gerado sem biblioteca pesada (`src/lib/planilha.ts`).
