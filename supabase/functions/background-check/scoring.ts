import type { ProcessoJudicial } from './datajud.ts';
import type { PublicacaoDOU } from './dou.ts';
import type { DirectdCadastroSanitizado } from './directd.ts';

export type Bandeira = 'green' | 'yellow' | 'red';

export interface MotivoBandeira {
  /** Texto curto pra UI, em linguagem leiga. Ex: "Processo por violência doméstica" */
  texto: string;
  /** Severidade do motivo: 'critico' (vermelho), 'atencao' (amarelo), 'positivo' (verde/check) */
  nivel: 'critico' | 'atencao' | 'positivo';
}

export interface ResultadoScoring {
  bandeira: Bandeira;
  motivos: MotivoBandeira[];
  /** Quantidade de processos criminais GRAVES (subset de criminalProcessesCount) */
  criminaisGravesCount: number;
}

// Palavras-chave que sempre disparam VERMELHA quando aparecem em classe/assuntos
// Sem cutoff temporal — crime contra mulher fica vermelho pra sempre
const KEYWORDS_GRAVES = [
  'maria da penha',
  'violencia domestica',
  'violência doméstica',
  'feminicidio',
  'feminicídio',
  'estupro',
  'violencia sexual',
  'violência sexual',
  'importunacao sexual',
  'importunação sexual',
  'estupro de vulneravel',
  'estupro de vulnerável',
  'lesao corporal',
  'lesão corporal',
  'homicidio',
  'homicídio',
  'sequestro',
  'carcere privado',
  'cárcere privado',
  'ameaca',
  'ameaça',
  'stalking',
  'perseguicao',
  'perseguição',
  'trafico de pessoas',
  'tráfico de pessoas',
  'pedofilia',
  'pornografia infantil',
  'mandado de prisao',
  'mandado de prisão',
  'medida protetiva',
];

// Palavras-chave criminais "comuns" — disparam VERMELHA se há cutoff de até 5 anos
const KEYWORDS_CRIMINAIS_COMUNS = [
  'furto',
  'roubo',
  'estelionato',
  'fraude',
  'apropriacao indebita',
  'apropriação indébita',
  'receptacao',
  'receptação',
  'crime',
  'penal',
  'criminal',
];

/** Normaliza texto pra comparação com keywords (lowercase, sem acentos). */
function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Concatena classe + assuntos do processo em um texto único pra busca de keywords. */
function textoCompletoProcesso(p: ProcessoJudicial): string {
  const classe = p.classe?.nome ?? '';
  const assuntos = (p.assuntos ?? []).map((a) => a.nome).join(' ');
  return normalizarTexto(`${classe} ${assuntos}`);
}

/** Tenta parsear data de ajuizamento. Retorna null se inválida. */
function parseDataAjuizamento(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Idade do processo em anos a partir de hoje. */
function idadeProcessoEmAnos(p: ProcessoJudicial): number | null {
  const d = parseDataAjuizamento(p.dataAjuizamento);
  if (!d) return null;
  const ms = Date.now() - d.getTime();
  return Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000));
}

/** Verifica se processo é grave (palavras-chave da lista KEYWORDS_GRAVES, sem cutoff temporal). */
export function ehProcessoGrave(p: ProcessoJudicial): boolean {
  const texto = textoCompletoProcesso(p);
  return KEYWORDS_GRAVES.some((k) => texto.includes(k));
}

/** Verifica se processo é criminal comum (KEYWORDS_CRIMINAIS_COMUNS). */
export function ehProcessoCriminalComum(p: ProcessoJudicial): boolean {
  const texto = textoCompletoProcesso(p);
  // Se já é grave, não conta como "comum" (evita dupla contagem)
  if (ehProcessoGrave(p)) return false;
  return KEYWORDS_CRIMINAIS_COMUNS.some((k) => texto.includes(k));
}

/** Verifica se processo é cível. */
export function ehProcessoCivel(p: ProcessoJudicial): boolean {
  const texto = textoCompletoProcesso(p);
  if (ehProcessoGrave(p) || ehProcessoCriminalComum(p)) return false;
  return (
    texto.includes('civel') ||
    texto.includes('cível') ||
    texto.includes('cobranca') ||
    texto.includes('cobrança') ||
    texto.includes('execucao') ||
    texto.includes('execução') ||
    texto.includes('contrato')
  );
}

/**
 * Classifica bandeira baseada em regras objetivas.
 * Recebe processos, publicações DOU e dados Direct Data (pra detectar óbito).
 *
 * Regras:
 * 🔴 VERMELHA se:
 *  - Pessoa consta como falecida (Direct Data)
 *  - Algum processo grave (palavras-chave da lista, sem cutoff temporal)
 *  - 3+ processos cíveis recentes (até 3 anos) com padrão de inadimplência/cobrança
 *  - Algum processo criminal comum nos últimos 5 anos
 *
 * 🟡 AMARELA se:
 *  - 1-2 processos cíveis recentes
 *  - Processos criminais comuns >5 anos
 *  - Citação em DOU por questão judicial
 *
 * 🟢 VERDE se:
 *  - Nada do acima
 */
export function classificarBandeira(
  processos: ProcessoJudicial[],
  publicacoesDOU: PublicacaoDOU[],
  directdData: DirectdCadastroSanitizado | null,
): ResultadoScoring {
  const motivos: MotivoBandeira[] = [];

  // ÓBITO — bandeira vermelha automática
  if (directdData?.obito === true) {
    motivos.push({
      texto: 'Pessoa consta como falecida em registros oficiais',
      nivel: 'critico',
    });
    return {
      bandeira: 'red',
      motivos,
      criminaisGravesCount: 0,
    };
  }

  // Filtros e contagens
  const graves = processos.filter(ehProcessoGrave);
  const criminaisComuns = processos.filter(ehProcessoCriminalComum);
  const civeis = processos.filter(ehProcessoCivel);

  const civeisRecentes = civeis.filter((p) => {
    const idade = idadeProcessoEmAnos(p);
    return idade !== null && idade <= 3;
  });
  const criminaisComunsRecentes = criminaisComuns.filter((p) => {
    const idade = idadeProcessoEmAnos(p);
    return idade !== null && idade <= 5;
  });
  const criminaisComunsAntigos = criminaisComuns.filter((p) => {
    const idade = idadeProcessoEmAnos(p);
    return idade !== null && idade > 5;
  });

  // VERMELHA — qualquer processo grave (sem cutoff)
  if (graves.length > 0) {
    motivos.push({
      texto: `${graves.length} processo${graves.length > 1 ? 's' : ''} grave${graves.length > 1 ? 's' : ''} (violência, ameaça, abuso ou similares)`,
      nivel: 'critico',
    });
    if (criminaisComunsRecentes.length > 0) {
      motivos.push({
        texto: `${criminaisComunsRecentes.length} processo${criminaisComunsRecentes.length > 1 ? 's' : ''} criminal recente${criminaisComunsRecentes.length > 1 ? 's' : ''} (últimos 5 anos)`,
        nivel: 'critico',
      });
    }
    if (civeisRecentes.length > 0) {
      motivos.push({
        texto: `${civeisRecentes.length} processo${civeisRecentes.length > 1 ? 's' : ''} cível${civeisRecentes.length > 1 ? 'is' : ''} recente${civeisRecentes.length > 1 ? 's' : ''}`,
        nivel: 'atencao',
      });
    }
    return {
      bandeira: 'red',
      motivos,
      criminaisGravesCount: graves.length,
    };
  }

  // VERMELHA — 3+ processos cíveis recentes (padrão de inadimplência)
  if (civeisRecentes.length >= 3) {
    motivos.push({
      texto: `${civeisRecentes.length} processos cíveis nos últimos 3 anos — padrão de inadimplência ou litígios frequentes`,
      nivel: 'critico',
    });
    if (criminaisComunsRecentes.length > 0) {
      motivos.push({
        texto: `${criminaisComunsRecentes.length} processo${criminaisComunsRecentes.length > 1 ? 's' : ''} criminal recente${criminaisComunsRecentes.length > 1 ? 's' : ''}`,
        nivel: 'critico',
      });
    }
    return {
      bandeira: 'red',
      motivos,
      criminaisGravesCount: 0,
    };
  }

  // VERMELHA — processo criminal comum nos últimos 5 anos
  if (criminaisComunsRecentes.length > 0) {
    motivos.push({
      texto: `${criminaisComunsRecentes.length} processo${criminaisComunsRecentes.length > 1 ? 's' : ''} criminal recente${criminaisComunsRecentes.length > 1 ? 's' : ''} (últimos 5 anos)`,
      nivel: 'critico',
    });
    if (civeisRecentes.length > 0) {
      motivos.push({
        texto: `${civeisRecentes.length} processo${civeisRecentes.length > 1 ? 's' : ''} cível${civeisRecentes.length > 1 ? 'is' : ''} recente${civeisRecentes.length > 1 ? 's' : ''}`,
        nivel: 'atencao',
      });
    }
    return {
      bandeira: 'red',
      motivos,
      criminaisGravesCount: 0,
    };
  }

  // AMARELA — sinais de atenção (sem nada que dispare vermelha)
  const sinaisAtencao: MotivoBandeira[] = [];

  if (civeisRecentes.length > 0) {
    sinaisAtencao.push({
      texto: `${civeisRecentes.length} processo${civeisRecentes.length > 1 ? 's' : ''} cível${civeisRecentes.length > 1 ? 'is' : ''} recente${civeisRecentes.length > 1 ? 's' : ''} (últimos 3 anos)`,
      nivel: 'atencao',
    });
  }
  if (criminaisComunsAntigos.length > 0) {
    sinaisAtencao.push({
      texto: `${criminaisComunsAntigos.length} processo${criminaisComunsAntigos.length > 1 ? 's' : ''} criminal antigo${criminaisComunsAntigos.length > 1 ? 's' : ''} (mais de 5 anos)`,
      nivel: 'atencao',
    });
  }
  if (publicacoesDOU.length > 0) {
    // DOU isolado vira sinal de atenção apenas se houver outros sinais
    if (sinaisAtencao.length > 0) {
      sinaisAtencao.push({
        texto: `${publicacoesDOU.length} citação${publicacoesDOU.length > 1 ? 'ões' : ''} em Diário Oficial`,
        nivel: 'atencao',
      });
    }
  }

  if (sinaisAtencao.length > 0) {
    motivos.push(...sinaisAtencao);
    motivos.push({
      texto: 'Sem registros criminais graves',
      nivel: 'positivo',
    });
    return {
      bandeira: 'yellow',
      motivos,
      criminaisGravesCount: 0,
    };
  }

  // VERDE — nada encontrado, ou só DOU isolado leve
  if (processos.length === 0 && publicacoesDOU.length === 0) {
    motivos.push({
      texto: 'Nenhum processo judicial encontrado',
      nivel: 'positivo',
    });
    motivos.push({
      texto: 'Nenhuma publicação em Diário Oficial',
      nivel: 'positivo',
    });
  } else {
    motivos.push({
      texto: 'Sem registros criminais ou cíveis recentes relevantes',
      nivel: 'positivo',
    });
    if (publicacoesDOU.length > 0) {
      motivos.push({
        texto: `${publicacoesDOU.length} citação${publicacoesDOU.length > 1 ? 'ões' : ''} em Diário Oficial (sem indicação de questão judicial relevante)`,
        nivel: 'positivo',
      });
    }
  }

  return {
    bandeira: 'green',
    motivos,
    criminaisGravesCount: 0,
  };
}
