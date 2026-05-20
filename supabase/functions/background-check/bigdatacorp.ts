import type { BdcPessoaCadastro, BdcLookupResult, ProcessoJudicial } from './types.ts';

const BDC_ENDPOINT = 'https://plataforma.bigdatacorp.com.br/pessoas';
const DATASETS = 'basic_data,processes';
const TIMEOUT_MS = 30000;

interface BdcRequestBody {
  q: string;
  Datasets: string;
}

interface BdcResponse {
  Result?: Array<{
    BasicData?: Record<string, unknown>;
    Processes?: {
      TotalLawsuits?: number;
      Lawsuits?: Array<Record<string, unknown>>;
    };
  }>;
  Status?: Record<string, unknown>;
  QueryId?: string;
  ElapsedMilliseconds?: number;
}

/**
 * Constrói o parâmetro "q" do BDC a partir das chaves disponíveis.
 * Prioridade: CPF > Nome+Telefone > Telefone > Nome
 */
export function buildQuery(opts: {
  cpf?: string;
  nome?: string;
  telefone?: string;
  dataNascimento?: string; // formato dd/MM/yyyy ou ISO YYYY-MM-DD
}): string {
  const partes: string[] = [];

  // CPF tem prioridade absoluta — outras chaves são ignoradas
  if (opts.cpf) {
    partes.push(`doc{${normalizarCpf(opts.cpf)}}`);
  } else {
    if (opts.nome) partes.push(`name{${opts.nome.trim()}}`);
    if (opts.telefone) partes.push(`phone{${normalizarTelefoneParaBdc(opts.telefone)}}`);
    if (opts.dataNascimento) {
      const dataBdc = normalizarDataParaBdc(opts.dataNascimento);
      if (dataBdc) partes.push(`birthdate{${dataBdc}}`);
    }
  }

  if (partes.length === 0) {
    throw new Error('BDC: nenhuma chave de busca fornecida (cpf, nome ou telefone)');
  }

  // Parâmetros padrão do BDC (formato confirmado por inspeção do painel oficial)
  partes.push('returnupdates{false}');
  partes.push('dateformat{dd/MM/yyyy}');

  // BDC usa VÍRGULA como separador, não PLUS
  return partes.join(',');
}

export function normalizarDataParaBdc(data: string): string | null {
  if (!data) return null;
  const trimmed = data.trim();

  // Já em dd/MM/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  // ISO YYYY-MM-DD → dd/MM/yyyy
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1]}`;
  }

  // Formato inválido — não envia
  return null;
}

export function normalizarCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

export function normalizarTelefoneParaBdc(phone: string): string {
  // BDC espera telefone com 11 dígitos SEM código de país (não usar 55)
  // Ex: "(11) 99266-6603" → "11992666603"
  const digits = phone.replace(/\D/g, '');
  // Se vier com 55 na frente (13 dígitos), remove
  if (digits.length === 13 && digits.startsWith('55')) {
    return digits.slice(2);
  }
  return digits;
}

export function mascararCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.XXX.XXX-${digits.slice(9, 11)}`;
}

export function formatarCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

async function callBdc(body: BdcRequestBody): Promise<BdcResponse> {
  const tokenId = Deno.env.get('BIGDATACORP_TOKEN_ID');
  const accessToken = Deno.env.get('BIGDATACORP_ACCESS_TOKEN');
  if (!tokenId || !accessToken) {
    throw new Error('BDC: credenciais não configuradas (BIGDATACORP_TOKEN_ID, BIGDATACORP_ACCESS_TOKEN)');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startMs = Date.now();

  try {
    const response = await fetch(BDC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'AccessToken': accessToken,
        'TokenId': tokenId,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`BDC HTTP ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const responseData = await response.json();
    const elapsedMs = Date.now() - startMs;

    // Log normal — sempre ativo (sem dados sensíveis)
    const resultCount = Array.isArray(responseData?.Result) ? responseData.Result.length : 0;
    const hasBasicData = Boolean(responseData?.Result?.[0]?.BasicData);
    const hasProcesses = Boolean(responseData?.Result?.[0]?.Processes);
    console.log(
      `[BDC] q=${body.q.replace(/\{[^}]+\}/g, '{...}')} datasets=${body.Datasets} status=${response.status} results=${resultCount} hasBasic=${hasBasicData} hasProcesses=${hasProcesses} elapsed=${elapsedMs}ms`
    );

    // Log de debug — só ativo se BDC_DEBUG=1
    const debugEnabled = Deno.env.get('BDC_DEBUG') === '1';
    if (debugEnabled) {
      console.log('[BDC DEBUG] Query enviada:', body.q);
      console.log('[BDC DEBUG] Resposta crua:', JSON.stringify(responseData, null, 2));
    }

    return responseData;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseBasicData(raw: Record<string, unknown> | undefined): BdcPessoaCadastro | null {
  if (!raw) return null;

  const cpfRaw = (raw['TaxIdNumber'] as string) || '';
  const cpfDigits = cpfRaw.replace(/\D/g, '');

  const birthDateIso = raw['BirthDate'] as string | null;
  const dataNascimento = parseBdcDate(birthDateIso);

  let estadoCivil: string | null = null;
  const ms = raw['MaritalStatus'];
  if (typeof ms === 'string') {
    estadoCivil = ms;
  } else if (ms && typeof ms === 'object' && 'FirstLevel' in (ms as Record<string, unknown>)) {
    estadoCivil = (ms as Record<string, unknown>).FirstLevel as string;
  }

  const genderRaw = raw['Gender'] as string | null;
  const genero = genderRaw === 'M' ? 'MASCULINO' : genderRaw === 'F' ? 'FEMININO' : null;

  return {
    cpf: formatarCpf(cpfDigits),
    cpfMascarado: mascararCpf(cpfDigits),
    nomeCompleto: (raw['Name'] as string) || '',
    dataNascimento,
    idade: (raw['Age'] as number) ?? null,
    nomeMae: (raw['MotherName'] as string) || null,
    nomePai: (raw['FatherName'] as string) || null,
    genero,
    estadoCivil,
    signo: (raw['ZodiacSign'] as string) || null,
    statusReceita: (raw['TaxIdStatus'] as string) || null,
    temObito: Boolean(raw['HasObitIndication']),
    dataObito: parseBdcDate(raw['DateOfDeath'] as string | null),
    enderecos: [],
    telefones: [],
  };
}

function parseBdcDate(value: string | null): string | null {
  if (!value) return null;

  // Já no formato dd/MM/yyyy (BDC retorna assim quando passamos dateformat{dd/MM/yyyy})
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    return value;
  }

  // Fallback: ISO 8601 (caso BDC não respeite dateformat em algum campo)
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  return null;
}

function parseProcesses(raw: Record<string, unknown> | undefined): ProcessoJudicial[] {
  if (!raw) return [];
  const lawsuits = raw['Lawsuits'] as Array<Record<string, unknown>> | undefined;
  if (!lawsuits) return [];

  return lawsuits.map((l) => {
    const tipoClasse =
      (l['Type'] as string) || (l['InferredCNJProcedureType'] as string) || '';
    const mainSubject = l['MainSubject'] as string | undefined;
    const district = (l['CourtDistrict'] as string) || '';

    return {
      numeroProcesso: (l['Number'] as string) || '',
      tribunal: (l['CourtName'] as string) || '',
      tribunalNome: (l['CourtName'] as string) || '',
      dataAjuizamento: (l['PublicationDate'] as string) || '',
      classe: tipoClasse ? { codigo: 0, nome: tipoClasse } : undefined,
      assuntos: mainSubject ? [{ codigo: 0, nome: mainSubject }] : [],
      orgaoJulgador: district ? { nome: district } : undefined,
      grau: (l['CourtLevel'] as string) || '',
      movimentos: [],
      status: (l['Status'] as string) || '',
      polaridade: extractPolaridade(l),
      segredoJustica: ((l['Status'] as string) || '').toUpperCase().includes('SEGREDO'),
      dataDistribuicao: (l['PublicationDate'] as string) || '',
      dataUltimaMovimentacao: (l['LastMovementDate'] as string) || '',
      partes: extractPartes(l),
    };
  });
}

function extractPolaridade(lawsuit: Record<string, unknown>): 'Ativo' | 'Passivo' | 'Neutro' | undefined {
  const parties = lawsuit['Parties'] as Array<Record<string, unknown>> | undefined;
  if (!parties || parties.length === 0) return undefined;
  for (const p of parties) {
    const polarity = (p['Polarity'] as string) || '';
    if (polarity === 'Ativo' || polarity === 'Passivo' || polarity === 'Neutro') {
      return polarity;
    }
  }
  return undefined;
}

function extractPartes(lawsuit: Record<string, unknown>): Array<{
  nome: string;
  documento?: string;
  polaridade: string;
  specificType: string;
}> {
  const parties = lawsuit['Parties'] as Array<Record<string, unknown>> | undefined;
  if (!parties) return [];
  return parties.map((p) => ({
    nome: (p['Name'] as string) || '',
    documento: (p['Doc'] as string) || undefined,
    polaridade: (p['Polarity'] as string) || 'Neutro',
    specificType: ((p['Type'] as Record<string, unknown>)?.['SpecificType'] as string) || '',
  }));
}

export async function buscarCadastroPorCpf(cpf: string): Promise<BdcLookupResult> {
  try {
    const q = buildQuery({ cpf });
    const response = await callBdc({ q, Datasets: DATASETS });
    const result = response.Result?.[0];
    const cadastro = parseBasicData(result?.BasicData);
    if (!cadastro) {
      return { ok: false, data: null, errorType: 'parse' };
    }
    return { ok: true, data: cadastro };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function buscarCadastroPorNomeTelefone(
  nome: string,
  telefone: string,
  dataNascimento?: string,
): Promise<BdcLookupResult> {
  try {
    const q = buildQuery({ nome, telefone, dataNascimento });
    const response = await callBdc({ q, Datasets: DATASETS });
    const result = response.Result?.[0];
    const cadastro = parseBasicData(result?.BasicData);
    if (!cadastro) {
      return { ok: false, data: null, errorType: 'parse' };
    }
    return { ok: true, data: cadastro };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function buscarProcessosPorCpf(cpf: string): Promise<ProcessoJudicial[]> {
  try {
    const q = buildQuery({ cpf });
    const response = await callBdc({ q, Datasets: 'processes' });
    const result = response.Result?.[0];
    return parseProcesses(result?.Processes as Record<string, unknown>);
  } catch (err) {
    console.error('[BDC] erro buscando processos:', err);
    return [];
  }
}

export async function consultarPessoa(opts: {
  cpf?: string;
  nome?: string;
  telefone?: string;
  dataNascimento?: string;
}): Promise<{
  cadastro: BdcLookupResult;
  processos: ProcessoJudicial[];
}> {
  // Log da chave usada (sem expor valores)
  const chavesUsadas = [
    opts.cpf ? 'cpf' : null,
    opts.nome ? 'nome' : null,
    opts.telefone ? 'telefone' : null,
    opts.dataNascimento ? 'dataNascimento' : null,
  ].filter(Boolean).join(',');
  console.log(`[BDC] consultarPessoa chamada com chaves: ${chavesUsadas}`);

  try {
    const q = buildQuery(opts);
    const response = await callBdc({ q, Datasets: DATASETS });
    const result = response.Result?.[0];
    const cadastro = parseBasicData(result?.BasicData);
    const processos = parseProcesses(result?.Processes as Record<string, unknown>);

    if (!cadastro) {
      return {
        cadastro: { ok: false, data: null, errorType: 'parse' },
        processos: [],
      };
    }
    return {
      cadastro: { ok: true, data: cadastro },
      processos,
    };
  } catch (err) {
    return {
      cadastro: mapErrorToResult(err),
      processos: [],
    };
  }
}

function mapErrorToResult(err: unknown): BdcLookupResult {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('aborted') || msg.includes('timeout')) {
    return { ok: false, data: null, errorType: 'timeout' };
  }
  if (msg.includes('401') || msg.includes('403')) {
    return { ok: false, data: null, errorType: 'auth' };
  }
  if (msg.startsWith('BDC HTTP')) {
    const statusMatch = msg.match(/HTTP (\d+)/);
    return {
      ok: false,
      data: null,
      errorType: 'http',
      statusCode: statusMatch ? parseInt(statusMatch[1], 10) : undefined,
    };
  }
  console.error('[BDC] erro não mapeado:', err);
  return { ok: false, data: null, errorType: 'unknown' };
}
