/**
 * Diário Oficial da União (DOU) - Imprensa Nacional
 *
 * A busca no DOU é feita via o próprio portal in.gov.br/consulta
 * que expõe uma API interna de busca usada pelo frontend deles.
 *
 * Endpoint usado:
 * https://www.in.gov.br/consulta/-/buscar/dou
 *
 * Alternativa mais estável: Querido Diário (Open Knowledge Brasil)
 * https://queridodiario.ok.org.br/
 */

export interface PublicacaoDOU {
  titulo: string;
  secao: string;
  data: string;
  orgao: string;
  ementa?: string;
  url: string;
  trecho?: string;
}

/**
 * Busca menções a um nome no DOU (últimos N anos).
 * Usa a API interna do portal in.gov.br.
 */
export async function buscarNoDOU(nome: string, anosAtras = 5): Promise<PublicacaoDOU[]> {
  const hoje = new Date();
  const dataInicio = new Date(hoje);
  dataInicio.setFullYear(hoje.getFullYear() - anosAtras);

  const params = new URLSearchParams({
    q: `"${nome}"`,
    s: 'todos',
    'publishFrom': dataInicio.toISOString().split('T')[0],
    'publishTo': hoje.toISOString().split('T')[0],
    delta: '20',
  });

  const url = `https://www.in.gov.br/consulta/-/buscar/dou?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SafetyDate/1.0)',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`[DOU] status ${response.status}`);
      return [];
    }

    const html = await response.text();

    // O portal retorna HTML com dados embutidos em JSON
    // Extrai via regex o array jsonArray que contém os resultados
    const match = html.match(/var\s+jsonArray\s*=\s*(\[[\s\S]*?\]);/);
    if (!match) return [];

    const resultados = JSON.parse(match[1]);

    return resultados.slice(0, 20).map((r: any) => ({
      titulo: r.title || '',
      secao: r.pubName || '',
      data: r.pubDate || '',
      orgao: r.hierarchyStr || '',
      ementa: r.content?.slice(0, 300),
      url: `https://www.in.gov.br/en/web/dou/-/${r.urlTitle}`,
      trecho: extrairTrecho(r.content, nome),
    }));
  } catch (err) {
    console.log('[DOU] erro:', err);
    return [];
  }
}

/**
 * Extrai o trecho do texto onde o nome aparece (contexto de 120 chars).
 */
function extrairTrecho(texto: string | undefined, nome: string): string | undefined {
  if (!texto) return undefined;
  const idx = texto.toLowerCase().indexOf(nome.toLowerCase());
  if (idx === -1) return undefined;
  const start = Math.max(0, idx - 60);
  const end = Math.min(texto.length, idx + nome.length + 60);
  return '...' + texto.slice(start, end).trim() + '...';
}

/**
 * Classifica o tipo da publicação no DOU baseado em palavras-chave.
 * Útil para identificar penalidades, demissões, condenações.
 */
export function classificarPublicacaoDOU(p: PublicacaoDOU): 'penalidade' | 'nomeacao' | 'outro' {
  const texto = `${p.titulo} ${p.ementa || ''}`.toLowerCase();

  if (
    texto.includes('demissão') ||
    texto.includes('penalidade') ||
    texto.includes('suspensão') ||
    texto.includes('cassação') ||
    texto.includes('inidôneo') ||
    texto.includes('condenação') ||
    texto.includes('improbidade')
  ) {
    return 'penalidade';
  }

  if (texto.includes('nomeação') || texto.includes('posse')) {
    return 'nomeacao';
  }

  return 'outro';
}
