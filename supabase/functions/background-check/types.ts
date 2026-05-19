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
  status?: string;
  polaridade?: 'Ativo' | 'Passivo' | 'Neutro';
  segredoJustica?: boolean;
  dataDistribuicao?: string;
  dataUltimaMovimentacao?: string;
  partes?: Array<{
    nome: string;
    documento?: string;
    polaridade: string;
    specificType: string;
  }>;
}

// Tipos específicos do BigDataCorp (fornecedor de dados)
// Mantém estrutura compatível com a saída do directd.ts pra ser drop-in replacement

export interface BdcPessoaCadastro {
  cpf: string;
  cpfMascarado: string;
  nomeCompleto: string;
  dataNascimento: string | null;
  idade: number | null;
  nomeMae: string | null;
  nomePai: string | null;
  genero: 'MASCULINO' | 'FEMININO' | null;
  estadoCivil: string | null;
  signo?: string | null;  // ex: "ESCORPIAO", "TOURO", "LEAO" - vem do campo ZodiacSign do BDC
  statusReceita: 'REGULAR' | 'IRREGULAR' | 'SUSPENSO' | 'CANCELADO' | 'NULO' | string | null;
  temObito: boolean;
  dataObito: string | null;
  enderecos?: Array<{
    cidade: string | null;
    uf: string | null;
    logradouro?: string | null;
  }>;
  telefones?: Array<{
    numero: string;
    tipo: string;
  }>;
}

export interface BdcLookupResult {
  ok: boolean;
  data: BdcPessoaCadastro | null;
  errorType?: 'auth' | 'timeout' | 'http' | 'parse' | 'unknown';
  statusCode?: number;
  fromCache?: boolean;
}
