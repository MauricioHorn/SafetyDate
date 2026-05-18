/**
 * Tipos compartilhados entre módulos do background-check.
 * Tipos vivem aqui pra não ficarem amarrados a um fornecedor específico.
 */

export interface ProcessoJudicial {
  numeroProcesso: string;
  tribunal: string;
  tribunalNome: string;
  dataAjuizamento: string;
  classe?: { codigo: number; nome: string };
  assuntos?: Array<{ codigo: number; nome: string }>;
  orgaoJulgador?: { nome: string };
  grau?: string;
  movimentos?: Array<{ nome: string; dataHora: string }>;
}
