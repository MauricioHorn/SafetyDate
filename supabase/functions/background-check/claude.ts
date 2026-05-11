/**
 * Integração com a Claude API (Anthropic)
 * Usa o Claude para:
 * 1. Ler e classificar gravidade dos processos encontrados
 * 2. Gerar resumo em linguagem acessível (sem juridiquês)
 * 3. Determinar a bandeira (verde/amarelo/vermelho)
 */

import type { ProcessoJudicial } from './datajud.ts';
import type { PublicacaoDOU } from './dou.ts';
import type { Bandeira } from './scoring.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const MODEL = 'claude-opus-4-7';

export interface AnaliseIA {
  flag: 'green' | 'yellow' | 'red';
  summary: string;
  criminalProcessesCount: number;
}

export interface AnaliseEnrichment {
  directdProfile?: {
    nomeCompleto?: string;
    dataNascimento?: string;
    idade?: number;
    cidade?: string;
    uf?: string;
  };
  phoneCrosscheck?: {
    status: 'match' | 'mismatch' | 'not_provided' | 'not_available';
  };
  bandeiraJaClassificada?: Bandeira;
}

const SYSTEM_PROMPT = `Você é o assistente de análise de segurança do SafetyDate — uma plataforma que ajuda mulheres a verificarem antecedentes antes de encontros, relacionamentos ou contratações.

Você vai receber dados de até 3 fontes:
1) Processos judiciais (CNJ DataJud)
2) Publicações no Diário Oficial (DOU)
3) Dados cadastrais básicos de uma base privada de cadastro pessoal (quando disponíveis)

Sua tarefa: analisar os dados recebidos e gerar:
1. Um RESUMO em português claro, SEM juridiquês, com 3-6 frases
2. Uma BANDEIRA de risco: green, yellow ou red
3. A CONTAGEM de processos criminais

CRITÉRIOS DE BANDEIRA:

🟢 VERDE (green) — use quando:
- Nenhum processo encontrado
- Apenas processos cíveis comuns sem gravidade (cobrança, contratos, pequenas causas)
- Apenas processos como autor/vítima (não como réu/acusado)

🟡 AMARELA (yellow) — use quando:
- Múltiplos processos cíveis (5+)
- Processos trabalhistas como reclamado
- Ações de família, divórcio litigioso, pensão alimentícia em atraso
- Processos de cobrança / execução fiscal recorrentes
- Penalidades administrativas leves no DOU

🔴 VERMELHA (red) — use quando:
- QUALQUER processo criminal (violência, agressão, homicídio, estupro, lesão corporal, ameaça)
- Medidas protetivas da Lei Maria da Penha
- Crimes contra a mulher (feminicídio, violência doméstica)
- Crimes contra crianças
- Condenações por improbidade administrativa
- Mandado de prisão em aberto

IMPORTANTE:
- Seja objetiva e factual, sem dramatizar
- Priorize o risco com base em processos judiciais e DOU
- Se houver dados cadastrais, mencione consistência cadastral apenas se relevante para contexto
- Se phoneCrosscheck.status = "mismatch", mencione no resumo de forma natural que o telefone informado não foi encontrado nos cadastros públicos da pessoa, sem dramatizar. Use linguagem acessível, não técnica.
- Divergência de telefone, isoladamente, não deve elevar bandeira por si só
- NÃO cite nomes de terceiros que aparecem nos processos
- NÃO mencionar Receita Federal
- NÃO mencionar óbito
- Se a pessoa é vítima e não réu, deixe claro
- Se são processos antigos (>10 anos) e não criminais, contextualize
- Em caso de poucos dados, diga isso com transparência

Retorne APENAS um JSON válido no formato:
{
  "flag": "green" | "yellow" | "red",
  "summary": "resumo em 3-6 frases...",
  "criminalProcessesCount": número
}`;

const SYSTEM_PROMPT_COM_BANDEIRA = `Você é o assistente de análise de segurança do SafetyDate.

A bandeira de risco JÁ FOI CLASSIFICADA externamente por um sistema de regras objetivas. Você NÃO decide a cor. Sua tarefa é apenas gerar o RESUMO em português claro (3-6 frases), SEM juridiquês, explicando por que a pessoa caiu nessa bandeira, baseado nos dados recebidos.

Você vai receber:
1. A bandeira já decidida (green, yellow, red)
2. Os dados (processos, DOU, cadastro)

REGRAS:
- Use linguagem acessível, não técnica
- Foque em explicar O QUE FOI ENCONTRADO de forma factual
- NÃO contradiga a bandeira já dada
- NÃO cite nomes de terceiros
- NÃO mencionar Receita Federal
- NÃO mencionar óbito (mesmo se a bandeira for red por isso, é o sistema que decide o que mostrar)
- Se a pessoa é vítima e não réu, deixe claro
- Em caso de poucos dados, diga isso com transparência
- Se phoneCrosscheck.status = "mismatch", mencione no resumo de forma natural que o telefone informado não foi encontrado nos cadastros públicos da pessoa, sem dramatizar

Retorne APENAS um JSON válido no formato:
{
  "flag": "green" | "yellow" | "red",
  "summary": "resumo em 3-6 frases explicando a bandeira...",
  "criminalProcessesCount": número
}

IMPORTANTE: o campo "flag" deve ser igual à bandeira fornecida. NÃO mude.`;

export async function analisarComClaude(
  nome: string,
  processos: ProcessoJudicial[],
  publicacoesDOU: PublicacaoDOU[],
  enrichment?: AnaliseEnrichment
): Promise<AnaliseIA> {
  // Se não encontrou nada, retorna verde direto (economiza tokens)
  if (processos.length === 0 && publicacoesDOU.length === 0) {
    return {
      flag: 'green',
      summary: `Não encontramos processos judiciais nem publicações no Diário Oficial relacionadas a ${nome} nas bases consultadas. Isso é um bom sinal, mas lembre-se: ausência de registros não é garantia absoluta. Continue avaliando outros sinais e confie na sua intuição.`,
      criminalProcessesCount: 0,
    };
  }

  // Monta o contexto para o Claude
  const processosResumidos = processos.slice(0, 30).map((p) => ({
    numero: p.numeroProcesso,
    tribunal: p.tribunalNome,
    data: p.dataAjuizamento,
    classe: p.classe?.nome,
    assuntos: p.assuntos?.map((a) => a.nome).slice(0, 3),
    orgao: p.orgaoJulgador?.nome,
    ultimosMovimentos: p.movimentos?.slice(0, 3).map((m) => m.nome),
  }));

  const douResumido = publicacoesDOU.slice(0, 10).map((p) => ({
    titulo: p.titulo,
    data: p.data,
    orgao: p.orgao,
    trecho: p.trecho,
  }));

  const cadastroResumo = enrichment?.directdProfile
    ? {
        nomeCompleto: enrichment.directdProfile.nomeCompleto,
        dataNascimento: enrichment.directdProfile.dataNascimento,
        idade: enrichment.directdProfile.idade,
        cidade: enrichment.directdProfile.cidade,
        uf: enrichment.directdProfile.uf,
      }
    : null;

  const phoneResumo = enrichment?.phoneCrosscheck
    ? { status: enrichment.phoneCrosscheck.status }
    : null;

  const blocoCadastro = cadastroResumo
    ? `CADASTRO (base privada de cadastro pessoal):\n${JSON.stringify(cadastroResumo, null, 2)}\n`
    : '';

  const blocoPhone = phoneResumo
    ? `PHONE CROSSCHECK:\n${JSON.stringify(phoneResumo, null, 2)}\n`
    : '';

  const blocoBandeira = enrichment?.bandeiraJaClassificada
    ? `BANDEIRA JÁ DECIDIDA (sistema de regras): ${enrichment.bandeiraJaClassificada}\n\n`
    : '';

  const userMessage = `${blocoBandeira}Analise os dados abaixo sobre a pessoa pesquisada: **${nome}**

${blocoCadastro}${blocoPhone}

PROCESSOS JUDICIAIS ENCONTRADOS (${processos.length} total):
${JSON.stringify(processosResumidos, null, 2)}

PUBLICAÇÕES NO DIÁRIO OFICIAL (${publicacoesDOU.length} total):
${JSON.stringify(douResumido, null, 2)}

Retorne o JSON conforme instruído.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: enrichment?.bandeiraJaClassificada
          ? SYSTEM_PROMPT_COM_BANDEIRA
          : SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('[Claude] erro:', errorText);
      throw new Error(`Claude API: ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';

    // Extrai JSON da resposta (Claude pode adicionar texto antes/depois)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Sem JSON na resposta');

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      flag: parsed.flag || 'yellow',
      summary: parsed.summary || 'Análise indisponível.',
      criminalProcessesCount: parsed.criminalProcessesCount || 0,
    };
  } catch (err) {
    console.log('[Claude] erro na análise:', err);
    // Fallback: análise básica sem IA
    return fallbackAnalise(nome, processos, publicacoesDOU);
  }
}

/**
 * Análise fallback quando o Claude está indisponível.
 * Classificação baseada em keywords.
 */
function fallbackAnalise(
  nome: string,
  processos: ProcessoJudicial[],
  publicacoesDOU: PublicacaoDOU[]
): AnaliseIA {
  const criminais = processos.filter((p) => {
    const nome = (p.classe?.nome || '').toLowerCase();
    const assuntos = (p.assuntos || []).map((a) => a.nome.toLowerCase()).join(' ');
    return (
      nome.includes('crim') ||
      nome.includes('penal') ||
      assuntos.includes('violência') ||
      assuntos.includes('homicídio')
    );
  });

  let flag: 'green' | 'yellow' | 'red' = 'green';
  if (criminais.length > 0) flag = 'red';
  else if (processos.length >= 5 || publicacoesDOU.length >= 3) flag = 'yellow';

  return {
    flag,
    summary: `Encontramos ${processos.length} processos e ${publicacoesDOU.length} publicações no Diário Oficial. ${
      criminais.length > 0
        ? `Atenção: ${criminais.length} deles são de natureza criminal. Recomendamos cautela.`
        : processos.length > 0
        ? 'Nenhum processo criminal identificado. Os processos encontrados parecem ser de natureza cível ou administrativa.'
        : 'Nada significativo encontrado.'
    }`,
    criminalProcessesCount: criminais.length,
  };
}
