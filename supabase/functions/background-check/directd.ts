/**
 * Direct Data — Cadastro Pessoa Física Plus + Enriquecimento Lead
 * - CadastroPessoaFisicaPlus: GET ...?CPF=...&Token=...
 * - EnriquecimentoLead: GET ...?CELULAR=...&Token=...
 *
 * Token: enviado como query param Token (DIRECTD_API_TOKEN no Supabase).
 * Resposta tratada de forma defensiva — campos podem variar conforme API.
 */

const DIRECTD_API_TOKEN = Deno.env.get('DIRECTD_API_TOKEN');
const CADASTRO_PF_PLUS_URL = 'https://apiv3.directd.com.br/api/CadastroPessoaFisicaPlus';
const ENRIQUECIMENTO_LEAD_URL = 'https://apiv3.directd.com.br/api/EnriquecimentoLead';
const ADVANCED_SEARCH_URL = 'https://api.app.directd.com.br/api/AdvancedSearch/FilterNaturalPerson';
const PROCESSING_IDS_URL = 'https://api.app.directd.com.br/api/AdvancedSearch/ProcessingIds';
const VIEW_SEARCH_URL = 'https://api.app.directd.com.br/api/AdvancedSearch/ViewSearch';
const FETCH_TIMEOUT_MS = 15_000;

/** Erros categorizados para logs e raw_data (fluxo principal não deve falhar). */
export type DirectdErrorType = 'auth' | 'timeout' | 'http' | 'parse' | 'unknown';

export interface DirectdTelefone {
  numero: string;
  tipo?: string;
  whatsapp?: boolean;
}

export interface DirectdEndereco {
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
}

/** Payload bruto retornado pela API (estrutura flexível). */
export type DirectdCadastroBruto = Record<string, unknown>;

export interface DirectdCadastroSanitizado {
  nomeCompleto?: string;
  dataNascimento?: string;
  idade?: number;
  nomeMae?: string;
  telefones: DirectdTelefone[];
  enderecos: DirectdEndereco[];
  /** Presente apenas no retorno EnriquecimentoLead. */
  cpf?: string;
  sexo?: string;
  signo?: string;
  emails?: string[];
  /** Auditoria interna — não expor na UI nem no prompt Claude. */
  obito?: boolean;
  source: 'directd';
  consultadoEm: string;
}

export type PhoneMatchStatus =
  | 'match'
  | 'mismatch'
  | 'not_provided'
  | 'not_available';

export interface PhoneCrosscheck {
  inputInformado: boolean;
  numeroInformadoNormalizado?: string;
  matchExato: boolean;
  numerosCompativeis: string[];
  status: PhoneMatchStatus;
}

export interface DirectdLookupResult {
  ok: boolean;
  /** true quando reuso de background_checks (24h); false ao consultar API. */
  fromCache: boolean;
  data: DirectdCadastroSanitizado | null;
  errorType?: DirectdErrorType;
  statusCode?: number;
}

export interface PesquisaAvancadaCandidato {
  id: string;
  cpf: string;
  fullName: string;
  motherName: string;
  dateOfBirth: string;
}

export interface PesquisaAvancadaResultado {
  ok: boolean;
  candidatos: PesquisaAvancadaCandidato[];
  numberOfPeople: number;
  errorType?: DirectdErrorType;
  statusCode?: number;
  errorMessage?: string;
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

/** Normaliza nome para comparação local (trim, lowercase, remove acentos, colapsa espaços). */
function normalizarNomeLocal(nome: string): string {
  if (!nome) return '';
  return nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** Valida dígitos verificadores do CPF (11 dígitos). */
function cpfDigitosValidos(d: string): boolean {
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i], 10) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== parseInt(d[9], 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i], 10) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  return rest === parseInt(d[10], 10);
}

/**
 * Remove máscara e valida CPF. Retorna string só dígitos ou string vazia se inválido.
 */
export function normalizarCpf(cpf: string): string {
  const d = digitsOnly(cpf.trim());
  if (d.length !== 11 || !cpfDigitosValidos(d)) return '';
  return d;
}

/** Normaliza telefone BR para comparação (apenas dígitos; remove 55 inicial). */
export function normalizarTelefone(phone: string): string {
  let n = digitsOnly(phone.trim());
  if (n.startsWith('55') && n.length > 11) n = n.slice(2);
  if (n.length === 11 && n[0] === '0') n = n.slice(1);
  return n;
}

/**
 * Prepara telefone para query CELULAR na API EnriquecimentoLead.
 * Reutiliza normalizarTelefone (dígitos, sem código país 55 quando aplicável, sem zero inicial no caso de 11 dígitos).
 */
export function normalizarTelefoneParaApi(phone: string): string {
  return normalizarTelefone(phone);
}

/** Remove pontuação do CPF mas preserva asteriscos (caso venha mascarado da Pesquisa Avançada). */
export function normalizarCpfMascarado(cpf: string): string {
  if (!cpf) return '';
  return cpf.replace(/[^\d*]/g, '');
}

/** Normaliza nome para comparação: trim, lowercase, remove acentos, colapsa espaços. */
export function normalizarNomeParaComparacao(nome: string): string {
  if (!nome) return '';
  return nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function mesmaPessoa(
  a: PesquisaAvancadaCandidato,
  b: PesquisaAvancadaCandidato,
): boolean {
  const cpfA = normalizarCpfMascarado(a.cpf);
  const cpfB = normalizarCpfMascarado(b.cpf);
  const cpfsValidos = cpfA && cpfB && !/^\*+$/.test(cpfA) && !/^\*+$/.test(cpfB);
  if (cpfsValidos && cpfA === cpfB) return true;

  const nomeA = normalizarNomeParaComparacao(a.fullName);
  const nomeB = normalizarNomeParaComparacao(b.fullName);
  const dataA = (a.dateOfBirth ?? '').trim();
  const dataB = (b.dateOfBirth ?? '').trim();
  if (nomeA && nomeB && dataA && dataB && nomeA === nomeB && dataA === dataB) {
    return true;
  }

  return false;
}

export function interseccaoCandidatos(
  listaA: PesquisaAvancadaCandidato[],
  listaB: PesquisaAvancadaCandidato[],
): PesquisaAvancadaCandidato[] {
  return listaA.filter((a) => listaB.some((b) => mesmaPessoa(a, b)));
}

export function calcularRangeDataPorIdade(
  idadeAproximada: number,
  toleranciaAnos: number = 3,
): { dateOfBirthStart: string; dateOfBirthEnd: string } {
  const anoAtual = new Date().getFullYear();
  const anoMin = anoAtual - idadeAproximada - toleranciaAnos;
  const anoMax = anoAtual - idadeAproximada + toleranciaAnos;
  return {
    dateOfBirthStart: `${anoMin}-01-01`,
    dateOfBirthEnd: `${anoMax}-12-31`,
  };
}

/** Tenta parsear data em vários formatos comuns. Retorna null se não conseguir. */
export function parseDataNascimentoFlexivel(s: string): Date | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;

  const ddmmyyyy = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const yyyymmdd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (yyyymmdd) {
    const d = new Date(trimmed.length > 10 ? trimmed : `${trimmed}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function filtrarCandidatosPorRangeData(
  candidatos: PesquisaAvancadaCandidato[],
  dateOfBirthStart: string,
  dateOfBirthEnd: string,
): PesquisaAvancadaCandidato[] {
  const start = parseDataNascimentoFlexivel(dateOfBirthStart);
  const end = parseDataNascimentoFlexivel(dateOfBirthEnd);
  if (!start || !end) {
    console.log('[DirectD-AdvSearch] range de data inválido:', dateOfBirthStart, dateOfBirthEnd);
    return [];
  }
  return candidatos.filter((c) => {
    const d = parseDataNascimentoFlexivel(c.dateOfBirth);
    if (!d) {
      console.log('[DirectD-AdvSearch] dateOfBirth não parseável:', c.dateOfBirth);
      return false;
    }
    return d >= start && d <= end;
  });
}

export function filtrarCandidatosPorDataExata(
  candidatos: PesquisaAvancadaCandidato[],
  dataNascimento: string,
): PesquisaAvancadaCandidato[] {
  const alvo = parseDataNascimentoFlexivel(dataNascimento);
  if (!alvo) return [];
  const alvoTime = alvo.getTime();
  return candidatos.filter((c) => {
    const d = parseDataNascimentoFlexivel(c.dateOfBirth);
    return d ? d.getTime() === alvoTime : false;
  });
}

function telefonesEquivalentes(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const la = a.length >= 10 ? a.slice(-10) : a;
  const lb = b.length >= 10 ? b.slice(-10) : b;
  return la === lb;
}

/**
 * Cruza telefone informado pela usuária com lista oficial Direct Data.
 */
export function compararTelefone(
  phoneInput: string | undefined,
  telefonesOficiais: DirectdTelefone[] | undefined,
): PhoneCrosscheck {
  const trimmed = phoneInput?.trim();
  if (!trimmed) {
    return {
      inputInformado: false,
      matchExato: false,
      numerosCompativeis: [],
      status: 'not_provided',
    };
  }

  const inputNorm = normalizarTelefone(trimmed);
  const lista = telefonesOficiais ?? [];
  const oficiaisNorm = lista
    .map((t) => normalizarTelefone(t.numero))
    .filter((n) => n.length > 0);

  if (oficiaisNorm.length === 0) {
    return {
      inputInformado: true,
      numeroInformadoNormalizado: inputNorm,
      matchExato: false,
      numerosCompativeis: [],
      status: 'not_available',
    };
  }

  const compativeis = oficiaisNorm.filter((o) => telefonesEquivalentes(inputNorm, o));

  if (compativeis.length > 0) {
    return {
      inputInformado: true,
      numeroInformadoNormalizado: inputNorm,
      matchExato: true,
      numerosCompativeis: compativeis,
      status: 'match',
    };
  }

  return {
    inputInformado: true,
    numeroInformadoNormalizado: inputNorm,
    matchExato: false,
    numerosCompativeis: [],
    status: 'mismatch',
  };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && /^\d+$/.test(v)) return parseInt(v, 10);
  }
  return undefined;
}

function pickBool(obj: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'boolean') return v;
    if (v === 'true' || v === 'S' || v === 's') return true;
    if (v === 'false' || v === 'N' || v === 'n') return false;
    if (typeof v === 'number') return v === 1;
  }
  return undefined;
}

function mapTelefones(raw: unknown): DirectdTelefone[] {
  if (!Array.isArray(raw)) return [];
  const out: DirectdTelefone[] = [];
  for (const item of raw) {
    const o = asRecord(item);
    if (!o) continue;
    const num =
      pickString(o, [
        'telefoneComDDD',
        'TelefoneComDDD',
        'numero',
        'Numero',
        'telefone',
        'Telefone',
        'fone',
        'numeroTelefone',
      ]) ??
      (typeof item === 'string' ? item.trim() : undefined);
    if (!num) continue;
    out.push({
      numero: num,
      tipo: pickString(o, ['tipo', 'Tipo', 'tipoTelefone']),
      whatsapp: pickBool(o, ['whatsApp', 'whatsapp', 'WhatsApp', 'ehWhatsApp']),
    });
  }
  return out;
}

function mapEnderecos(raw: unknown): DirectdEndereco[] {
  if (!Array.isArray(raw)) return [];
  const out: DirectdEndereco[] = [];
  for (const item of raw) {
    const o = asRecord(item);
    if (!o) continue;
    out.push({
      logradouro: pickString(o, ['logradouro', 'Logradouro', 'endereco', 'Endereco']),
      numero: pickString(o, ['numero', 'Numero', 'numeroEndereco']),
      bairro: pickString(o, ['bairro', 'Bairro']),
      cidade: pickString(o, ['cidade', 'Cidade', 'municipio', 'Municipio']),
      uf: pickString(o, ['uf', 'UF', 'estado']),
      cep: pickString(o, ['cep', 'CEP', 'codigoPostal']),
    });
  }
  return out;
}

function mapEmails(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const o = asRecord(item);
    const addr =
      (o &&
        pickString(o, ['enderecoEmail', 'EnderecoEmail', 'email', 'Email'])) ??
      (typeof item === 'string' ? item.trim() : undefined);
    if (addr) out.push(addr);
  }
  return out;
}

function unwrapData(raw: unknown): Record<string, unknown> {
  const root = asRecord(raw) ?? {};
  const inner =
    asRecord(root['retorno']) ??
    asRecord(root['Retorno']) ??
    asRecord(root['data']) ??
    asRecord(root['Data']) ??
    asRecord(root['dados']) ??
    asRecord(root['result']) ??
    asRecord(root['Resultado']);
  return inner ?? root;
}

/**
 * Converte resposta JSON da API em objeto sanitizado para persistência e enriquecimento.
 * Campo de óbito é preservado apenas para auditoria em raw_data.
 */
export function sanitizarDirectdPayload(raw: unknown): DirectdCadastroSanitizado {
  const obj = unwrapData(raw);
  const obitoFlag =
    pickBool(obj, [
      'flagPossuiObito',
      'FlagPossuiObito',
      'possuiObito',
      'PossuiObito',
      'obito',
      'Obito',
    ]) ??
    pickBool(asRecord(obj['cadastro'] as unknown) ?? {}, ['possuiObito']);

  const cpfVal = pickString(obj, ['cpf', 'CPF', 'Cpf']);
  const sexoVal = pickString(obj, ['sexo', 'Sexo']);
  const signoVal = pickString(obj, ['signo', 'Signo']);
  const emailsArr = mapEmails(obj['emails'] ?? obj['Emails']);

  return {
    nomeCompleto: pickString(obj, [
      'nome',
      'Nome',
      'nomeCompleto',
      'NomeCompleto',
      'nomeSocial',
    ]),
    dataNascimento: pickString(obj, [
      'dataNascimento',
      'DataNascimento',
      'dtNascimento',
      'data_nascimento',
    ]),
    idade: pickNumber(obj, ['idade', 'Idade']),
    nomeMae: pickString(obj, ['nomeMae', 'NomeMae', 'nome_mae', 'filiacao', 'Filiacao']),
    telefones: mapTelefones(obj['telefones'] ?? obj['Telefones'] ?? obj['foneLista']),
    enderecos: mapEnderecos(obj['enderecos'] ?? obj['Enderecos'] ?? obj['listaEnderecos']),
    ...(cpfVal ? { cpf: cpfVal } : {}),
    ...(sexoVal ? { sexo: sexoVal } : {}),
    ...(signoVal ? { signo: signoVal } : {}),
    ...(emailsArr.length ? { emails: emailsArr } : {}),
    obito: obitoFlag,
    source: 'directd',
    consultadoEm: new Date().toISOString(),
  };
}

function classifyHttpError(status: number): DirectdErrorType {
  if (status === 401 || status === 403) return 'auth';
  return 'http';
}

/**
 * Consulta Cadastro PF Plus na Direct Data.
 * Fail-soft: em erro retorna `ok: false` e `data: null` (não lança).
 */
export async function buscarCadastroPorCpf(cpf: string): Promise<DirectdLookupResult> {
  const cpfLimpo = normalizarCpf(cpf);
  if (!cpfLimpo) {
    return {
      ok: false,
      fromCache: false,
      data: null,
      errorType: 'parse',
      statusCode: undefined,
    };
  }

  if (!DIRECTD_API_TOKEN?.trim()) {
    console.log('[DirectD] DIRECTD_API_TOKEN não configurado');
    return {
      ok: false,
      fromCache: false,
      data: null,
      errorType: 'unknown',
    };
  }

  const token = DIRECTD_API_TOKEN.trim();

  const params = new URLSearchParams();
  params.set('CPF', cpfLimpo);
  params.set('Token', token);
  const url = `${CADASTRO_PF_PLUS_URL}?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const et = classifyHttpError(response.status);
      console.log(`[DirectD] HTTP ${response.status} (${et})`);
      return {
        ok: false,
        fromCache: false,
        data: null,
        errorType: et,
        statusCode: response.status,
      };
    }

    const rawText = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(rawText);
    } catch {
      console.log('[DirectD] resposta não é JSON válido');
      return {
        ok: false,
        fromCache: false,
        data: null,
        errorType: 'parse',
      };
    }

    const data = sanitizarDirectdPayload(json);
    return {
      ok: true,
      fromCache: false,
      data,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      console.log('[DirectD] timeout');
      return {
        ok: false,
        fromCache: false,
        data: null,
        errorType: 'timeout',
      };
    }
    console.log('[DirectD] erro:', err);
    return {
      ok: false,
      fromCache: false,
      data: null,
      errorType: 'unknown',
    };
  }
}

/**
 * @deprecated Substituída por `pesquisaAvancadaPorTelefone` no fluxo name_phone v2.
 * Mantida pois ainda pode ser útil em casos específicos (enriquecer titular conhecido).
 * Não usar em código novo do fluxo name_phone.
 */
/**
 * Consulta Enriquecimento Lead na Direct Data (celular).
 * Fail-soft: em erro retorna `ok: false` e `data: null` (não lança).
 */
export async function buscarCadastroPorTelefone(
  telefone: string,
): Promise<DirectdLookupResult> {
  const celularLimpo = normalizarTelefoneParaApi(telefone);
  if (!celularLimpo || celularLimpo.length < 10 || celularLimpo.length > 11) {
    return {
      ok: false,
      fromCache: false,
      data: null,
      errorType: 'parse',
      statusCode: undefined,
    };
  }

  if (!DIRECTD_API_TOKEN?.trim()) {
    console.log('[DirectD-EnriqLead] DIRECTD_API_TOKEN não configurado');
    return {
      ok: false,
      fromCache: false,
      data: null,
      errorType: 'unknown',
    };
  }

  const token = DIRECTD_API_TOKEN.trim();

  const params = new URLSearchParams();
  params.set('CELULAR', celularLimpo);
  params.set('Token', token);
  const url = `${ENRIQUECIMENTO_LEAD_URL}?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const et = classifyHttpError(response.status);
      console.log(`[DirectD-EnriqLead] HTTP ${response.status} (${et})`);
      return {
        ok: false,
        fromCache: false,
        data: null,
        errorType: et,
        statusCode: response.status,
      };
    }

    const rawText = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(rawText);
    } catch {
      console.log('[DirectD-EnriqLead] resposta não é JSON válido');
      return {
        ok: false,
        fromCache: false,
        data: null,
        errorType: 'parse',
      };
    }

    const data = sanitizarDirectdPayload(json);
    return {
      ok: true,
      fromCache: false,
      data,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      console.log('[DirectD-EnriqLead] timeout');
      return {
        ok: false,
        fromCache: false,
        data: null,
        errorType: 'timeout',
      };
    }
    console.log('[DirectD-EnriqLead] erro:', err);
    return {
      ok: false,
      fromCache: false,
      data: null,
      errorType: 'unknown',
    };
  }
}

interface FilterNaturalPersonBody {
  fullName?: string;
  motherName?: string;
  postalCode?: string;
  street?: string;
  city?: string;
  state?: string;
  number?: string;
  neighborhood?: string;
  email?: string;
  phoneNumber?: string;
  dateOfBirthStart?: string;
  dateOfBirthEnd?: string;
}

/** Converte data ISO (YYYY-MM-DD) para formato BR (DD/MM/YYYY) que a Direct Data espera no body. */
function isoParaFormatoBR(iso: string): string {
  // Aceita YYYY-MM-DD, retorna DD/MM/YYYY
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ''; // formato inválido = string vazia (Direct Data aceita campo vazio)
  return `${m[3]}/${m[2]}/${m[1]}`;
}

async function chamarFilterNaturalPerson(
  body: FilterNaturalPersonBody,
  logTag: string,
): Promise<PesquisaAvancadaResultado> {
  if (!DIRECTD_API_TOKEN?.trim()) {
    console.log(`[${logTag}] DIRECTD_API_TOKEN não configurado`);
    return { ok: false, candidatos: [], numberOfPeople: 0, errorType: 'unknown' };
  }

  const token = DIRECTD_API_TOKEN.trim();
  const startedAt = Date.now();

  // Direct Data exige TODOS os 12 campos no body, mesmo vazios.
  // Datas precisam estar em DD/MM/YYYY (formato BR), não ISO.
  const fullBody: Record<string, string> = {
    fullName: (body.fullName ?? '').trim(),
    motherName: (body.motherName ?? '').trim(),
    postalCode: (body.postalCode ?? '').trim(),
    street: (body.street ?? '').trim(),
    city: (body.city ?? '').trim(),
    state: (body.state ?? '').trim(),
    number: (body.number ?? '').trim(),
    neighborhood: (body.neighborhood ?? '').trim(),
    email: (body.email ?? '').trim(),
    phoneNumber: (body.phoneNumber ?? '').trim(),
    dateOfBirthStart: body.dateOfBirthStart ? isoParaFormatoBR(body.dateOfBirthStart) : '',
    dateOfBirthEnd: body.dateOfBirthEnd ? isoParaFormatoBR(body.dateOfBirthEnd) : '',
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(ADVANCED_SEARCH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Token: token,
      },
      body: JSON.stringify(fullBody),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const et = classifyHttpError(response.status);
      console.log(`[${logTag}] HTTP ${response.status} (${et}) — body=${JSON.stringify(fullBody)}`);
      return {
        ok: false,
        candidatos: [],
        numberOfPeople: 0,
        errorType: et,
        statusCode: response.status,
      };
    }

    const rawText = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(rawText);
    } catch {
      console.log(`[${logTag}] resposta não é JSON válido`);
      return { ok: false, candidatos: [], numberOfPeople: 0, errorType: 'parse' };
    }

    const obj = asRecord(json) ?? {};
    const success = obj['success'] === true;
    const listFiltersRaw = Array.isArray(obj['listFilters']) ? obj['listFilters'] : [];
    const numberOfPeople =
      typeof obj['numberOfPeople'] === 'number'
        ? (obj['numberOfPeople'] as number)
        : listFiltersRaw.length;

    if (!success) {
      const errObj = asRecord(obj['error']);
      const errMsg = errObj ? pickString(errObj, ['message', 'Message']) : undefined;
      console.log(`[${logTag}] success=false — error=${errMsg ?? 'n/a'}`);
      return {
        ok: false,
        candidatos: [],
        numberOfPeople,
        errorType: 'http',
        errorMessage: errMsg,
      };
    }

    const candidatos: PesquisaAvancadaCandidato[] = listFiltersRaw
      .map((item: unknown) => {
        const o = asRecord(item);
        if (!o) return null;
        const c: PesquisaAvancadaCandidato = {
          id: pickString(o, ['id', 'Id']) ?? '',
          cpf: pickString(o, ['cpf', 'CPF']) ?? '',
          fullName: pickString(o, ['fullName', 'FullName']) ?? '',
          motherName: pickString(o, ['motherName', 'MotherName']) ?? '',
          dateOfBirth: pickString(o, ['dateOfBirth', 'DateOfBirth']) ?? '',
        };
        return c;
      })
      .filter((c): c is PesquisaAvancadaCandidato => c !== null);

    let candidatosFiltrados = candidatos;
    const nomeBuscado = (body.fullName ?? '').trim();
    if (nomeBuscado) {
      const palavrasBuscadas = normalizarNomeLocal(nomeBuscado).split(' ').filter(Boolean);
      candidatosFiltrados = candidatos.filter((c) => {
        const palavrasCandidato = normalizarNomeLocal(c.fullName).split(' ').filter(Boolean);
        return palavrasBuscadas.every((p) => palavrasCandidato.includes(p));
      });
      if (candidatosFiltrados.length !== candidatos.length) {
        console.log(`[${logTag}] filtro de nome exato: ${candidatos.length} -> ${candidatosFiltrados.length}`);
      }
    }

    const elapsed = Date.now() - startedAt;
    console.log(
      `[${logTag}] ok — numberOfPeople=${numberOfPeople} candidatos=${candidatos.length} apos_filtro=${candidatosFiltrados.length} elapsedMs=${elapsed}`,
    );

    return { ok: true, candidatos: candidatosFiltrados, numberOfPeople: candidatosFiltrados.length };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      console.log(`[${logTag}] timeout`);
      return { ok: false, candidatos: [], numberOfPeople: 0, errorType: 'timeout' };
    }
    console.log(`[${logTag}] erro:`, err);
    return { ok: false, candidatos: [], numberOfPeople: 0, errorType: 'unknown' };
  }
}

/**
 * Pesquisa Avançada Direct Data — busca por nome completo + filtros opcionais.
 * Endpoint: POST /api/AdvancedSearch/FilterNaturalPerson
 * Custo: GRATUITO (não debita saldo).
 */
export async function pesquisaAvancadaPorNome(
  nome: string,
  filtros?: {
    dateOfBirthStart?: string;
    dateOfBirthEnd?: string;
    city?: string;
    state?: string;
    motherName?: string;
  },
): Promise<PesquisaAvancadaResultado> {
  const nomeLimpo = (nome ?? '').trim();
  if (!nomeLimpo) {
    return { ok: false, candidatos: [], numberOfPeople: 0, errorType: 'parse' };
  }
  return chamarFilterNaturalPerson(
    {
      fullName: nomeLimpo,
      ...(filtros?.dateOfBirthStart ? { dateOfBirthStart: filtros.dateOfBirthStart } : {}),
      ...(filtros?.dateOfBirthEnd ? { dateOfBirthEnd: filtros.dateOfBirthEnd } : {}),
      ...(filtros?.city ? { city: filtros.city } : {}),
      ...(filtros?.state ? { state: filtros.state } : {}),
      ...(filtros?.motherName ? { motherName: filtros.motherName } : {}),
    },
    'DirectD-AdvSearch-Nome',
  );
}

/**
 * Pesquisa Avançada Direct Data — busca por telefone.
 * Endpoint: POST /api/AdvancedSearch/FilterNaturalPerson
 * Custo: GRATUITO (não debita saldo).
 */
export async function pesquisaAvancadaPorTelefone(
  telefone: string,
): Promise<PesquisaAvancadaResultado> {
  const telLimpo = normalizarTelefoneParaApi(telefone);
  if (!telLimpo || telLimpo.length < 10 || telLimpo.length > 11) {
    return { ok: false, candidatos: [], numberOfPeople: 0, errorType: 'parse' };
  }
  return chamarFilterNaturalPerson({ phoneNumber: telLimpo }, 'DirectD-AdvSearch-Tel');
}

/**
 * Inicia processamento de IDs de candidatos via Pesquisa Avançada.
 * Recebe os IDs internos (do FilterNaturalPerson) e retorna um searchUid
 * que será usado depois pelo viewSearchPorUid para buscar os dados completos.
 * Custo: GRATUITO (o custo está no ViewSearch, R$ 0,36 por pessoa).
 */
export async function processarIdsCandidato(
  ids: string[],
  searchName: string = 'ELAS - Background Check',
): Promise<{ ok: boolean; searchUid?: string; errorType?: DirectdErrorType; statusCode?: number }> {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, errorType: 'parse' };
  }
  if (!DIRECTD_API_TOKEN?.trim()) {
    console.log('[DirectD-ProcessingIds] DIRECTD_API_TOKEN não configurado');
    return { ok: false, errorType: 'unknown' };
  }
  const token = DIRECTD_API_TOKEN.trim();
  const body = { listIds: ids, searchName };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(PROCESSING_IDS_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Token: token,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const et = classifyHttpError(response.status);
      console.log(`[DirectD-ProcessingIds] HTTP ${response.status} (${et})`);
      return { ok: false, errorType: et, statusCode: response.status };
    }
    const rawText = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(rawText);
    } catch {
      console.log('[DirectD-ProcessingIds] resposta não é JSON válido');
      return { ok: false, errorType: 'parse' };
    }
    const obj = asRecord(json) ?? {};
    const success = obj['success'] === true;
    const searchUid = pickString(obj, ['searchUid', 'SearchUid', 'searchUId']);
    if (!success || !searchUid) {
      const errObj = asRecord(obj['error']);
      const errMsg = errObj ? pickString(errObj, ['message', 'Message']) : undefined;
      console.log(`[DirectD-ProcessingIds] success=${success} searchUid=${searchUid} err=${errMsg ?? 'n/a'}`);
      return { ok: false, errorType: 'http' };
    }
    console.log(`[DirectD-ProcessingIds] ok — searchUid=${searchUid}`);
    return { ok: true, searchUid };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      console.log('[DirectD-ProcessingIds] timeout');
      return { ok: false, errorType: 'timeout' };
    }
    console.log('[DirectD-ProcessingIds] erro:', err);
    return { ok: false, errorType: 'unknown' };
  }
}

/**
 * Busca os dados completos de uma pesquisa processada via ProcessingIds.
 * Recebe o searchUid retornado pelo ProcessingIds e devolve um DirectdLookupResult
 * com todos os dados do cadastro (CPF aberto, nome, dataNascimento, telefones, enderecos, etc).
 * Custo: R$ 0,36 por pessoa pesquisada.
 */
export async function viewSearchPorUid(
  searchUid: string,
): Promise<DirectdLookupResult> {
  if (!searchUid?.trim()) {
    return { ok: false, fromCache: false, data: null, errorType: 'parse' };
  }
  if (!DIRECTD_API_TOKEN?.trim()) {
    console.log('[DirectD-ViewSearch] DIRECTD_API_TOKEN não configurado');
    return { ok: false, fromCache: false, data: null, errorType: 'unknown' };
  }
  const token = DIRECTD_API_TOKEN.trim();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(VIEW_SEARCH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Token: token,
      },
      body: JSON.stringify({ searchUid: searchUid.trim() }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const et = classifyHttpError(response.status);
      console.log(`[DirectD-ViewSearch] HTTP ${response.status} (${et})`);
      return { ok: false, fromCache: false, data: null, errorType: et, statusCode: response.status };
    }
    const rawText = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(rawText);
    } catch {
      console.log('[DirectD-ViewSearch] resposta não é JSON válido');
      return { ok: false, fromCache: false, data: null, errorType: 'parse' };
    }
    const obj = asRecord(json) ?? {};
    const success = obj['success'] === true;
    const viewSearchObj = asRecord(obj['viewSearch']);
    const searchItemsRaw = viewSearchObj && Array.isArray(viewSearchObj['searchItems']) ? viewSearchObj['searchItems'] : [];
    const firstItem = searchItemsRaw.length > 0 ? asRecord(searchItemsRaw[0]) : null;
    if (!success || !firstItem) {
      console.log('[DirectD-ViewSearch] success=false ou sem searchItems');
      return { ok: false, fromCache: false, data: null, errorType: 'http' };
    }
    const returnJson = asRecord(firstItem['returnJson']);
    const retorno = returnJson ? asRecord(returnJson['retorno']) : null;
    if (!retorno) {
      console.log('[DirectD-ViewSearch] sem returnJson.retorno');
      return { ok: false, fromCache: false, data: null, errorType: 'parse' };
    }
    const data = sanitizarDirectdPayload(retorno);
    console.log(`[DirectD-ViewSearch] ok — nome=${data.nomeCompleto} idade=${data.idade}`);
    return { ok: true, fromCache: false, data };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      console.log('[DirectD-ViewSearch] timeout');
      return { ok: false, fromCache: false, data: null, errorType: 'timeout' };
    }
    console.log('[DirectD-ViewSearch] erro:', err);
    return { ok: false, fromCache: false, data: null, errorType: 'unknown' };
  }
}
