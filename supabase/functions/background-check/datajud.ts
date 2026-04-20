/**
 * DataJud - API Pública do CNJ
 * Documentação: https://datajud-wiki.cnj.jus.br/api-publica/
 *
 * A API usa Elasticsearch por baixo. Busca pode ser feita por:
 * - Número do processo
 * - Nome de partes envolvidas
 * - Classe processual
 *
 * Como são vários endpoints (um por tribunal), fazemos busca paralela.
 */

// Chave pública do CNJ (pode ser alterada — sempre verificar wiki)
const DATAJUD_KEY = Deno.env.get('DATAJUD_API_KEY') ||
  'cDZHYzlZa0JadVREZDJCendQbXY6QURHcmtpNkdRcGE0WWdHazZmY0Y3Zw==';

// Principais tribunais estaduais (cobertura dos maiores estados)
const TRIBUNAIS_PRINCIPAIS = [
  { alias: 'tjsp', nome: 'Tribunal de Justiça de São Paulo' },
  { alias: 'tjrj', nome: 'Tribunal de Justiça do Rio de Janeiro' },
  { alias: 'tjmg', nome: 'Tribunal de Justiça de Minas Gerais' },
  { alias: 'tjrs', nome: 'Tribunal de Justiça do Rio Grande do Sul' },
  { alias: 'tjpr', nome: 'Tribunal de Justiça do Paraná' },
  { alias: 'tjba', nome: 'Tribunal de Justiça da Bahia' },
  { alias: 'tjsc', nome: 'Tribunal de Justiça de Santa Catarina' },
  { alias: 'tjgo', nome: 'Tribunal de Justiça de Goiás' },
  { alias: 'tjdft', nome: 'Tribunal de Justiça do Distrito Federal e Territórios' },
  { alias: 'tjpe', nome: 'Tribunal de Justiça de Pernambuco' },
  { alias: 'tjce', nome: 'Tribunal de Justiça do Ceará' },
  { alias: 'tjes', nome: 'Tribunal de Justiça do Espírito Santo' },
  { alias: 'stj', nome: 'Superior Tribunal de Justiça' },
];

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

/**
 * Busca processos por nome em um tribunal específico.
 * Usa o Elasticsearch do DataJud com query de texto livre.
 */
async function buscarProcessosTribunal(
  alias: string,
  nomeTribunal: string,
  nome: string
): Promise<ProcessoJudicial[]> {
  const url = `https://api-publica.datajud.cnj.jus.br/api_publica_${alias}/_search`;

  const query = {
    size: 50,
    query: {
      bool: {
        should: [
          // Busca no nome das partes (caminho varia por tribunal)
          { match_phrase: { 'partes.polo.parte.pessoa.nome': nome } },
          { match: { 'partes.polo.parte.pessoa.nome': nome } },
        ],
        minimum_should_match: 1,
      },
    },
    sort: [{ '@timestamp': { order: 'desc' } }],
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `APIKey ${DATAJUD_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(query),
    });

    if (!response.ok) {
      console.log(`[DataJud ${alias}] status ${response.status}`);
      return [];
    }

    const data = await response.json();
    const hits = data?.hits?.hits || [];

    return hits.map((hit: any) => ({
      numeroProcesso: hit._source.numeroProcesso,
      tribunal: alias.toUpperCase(),
      tribunalNome: nomeTribunal,
      dataAjuizamento: hit._source.dataAjuizamento,
      classe: hit._source.classe,
      assuntos: hit._source.assuntos,
      orgaoJulgador: hit._source.orgaoJulgador,
      grau: hit._source.grau,
      movimentos: (hit._source.movimentos || []).slice(0, 5),
    }));
  } catch (err) {
    console.log(`[DataJud ${alias}] erro:`, err);
    return [];
  }
}

/**
 * Busca processos em todos os tribunais principais em paralelo.
 * Retorna lista consolidada, deduplicada por número de processo.
 */
export async function buscarProcessosPorNome(
  nome: string,
  dataNascimento?: string
): Promise<ProcessoJudicial[]> {
  const results = await Promise.all(
    TRIBUNAIS_PRINCIPAIS.map((t) =>
      buscarProcessosTribunal(t.alias, t.nome, nome)
    )
  );

  // Consolida e deduplica
  const todos = results.flat();
  const unique = new Map<string, ProcessoJudicial>();
  for (const p of todos) {
    if (p.numeroProcesso && !unique.has(p.numeroProcesso)) {
      unique.set(p.numeroProcesso, p);
    }
  }

  return Array.from(unique.values());
}

/**
 * Classifica processo por tipo (criminal, cível, trabalhista, etc)
 * baseado nos metadados do DataJud.
 */
export function classificarProcesso(p: ProcessoJudicial): 'criminal' | 'civel' | 'trabalhista' | 'outro' {
  const classeNome = (p.classe?.nome || '').toLowerCase();
  const assuntos = (p.assuntos || []).map((a) => a.nome.toLowerCase()).join(' ');

  if (
    classeNome.includes('crim') ||
    classeNome.includes('penal') ||
    assuntos.includes('crime') ||
    assuntos.includes('homicídio') ||
    assuntos.includes('lesão corporal') ||
    assuntos.includes('violência') ||
    assuntos.includes('estelionato')
  ) {
    return 'criminal';
  }

  if (classeNome.includes('trabalh')) return 'trabalhista';
  if (classeNome.includes('cível') || classeNome.includes('civel')) return 'civel';

  return 'outro';
}
