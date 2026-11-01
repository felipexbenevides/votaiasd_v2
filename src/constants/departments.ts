import { DepartmentCatalogItem, MeetingDepartmentConfig } from '../types';

/**
 * Catálogo Oficial de Departamentos do VOTAIASD (35 Departamentos)
 * 
 * Ordem oficial estabelecida:
 * 1. Ancionato — 7
 * 2. Tesoureiro — 1
 * 3. Secretário — 1
 * 4. Chefe dos Diáconos — 1
 * 5. Chefe das Diaconisas — 1
 * 6. Diácono — 7
 * 7. Diaconisa — 7
 * 8. Escola Sabatina — 1
 * 9. Ministério Pessoal — 1
 * 10. Coordenador de PG — 1
 * 11. Coordenador de Interessados — 1
 * 12. Ministério de Mordomia Cristã — 1
 * 13. Ministério de Publicações — 1
 * 14. Ministério da Visitação — 1
 * 15. Ministério da Conservação — 1
 * 16. Coordenador dos Escritos do Espírito de Profecia — 1
 * 17. Ministério de Oração — 1
 * 18. Ministério da Criança — 1
 * 19. Ministério do Adolescente — 1
 * 20. Ministério Jovem Adventista — 1
 * 21. Ministério de Universitários — 1
 * 22. Clube de Desbravadores — 1
 * 23. Clube de Aventureiros — 1
 * 24. Ministério da Família — 1
 * 25. Ação Solidária Adventista (ASA) — 1
 * 26. Ministério da Mulher — 1
 * 27. Ministério dos Homens — 1
 * 28. Ministério Adventista das Possibilidades (MAP) — 1
 * 29. Ministério da Recepção — 1
 * 30. Ministério da Saúde — 1
 * 31. Comunicação — 1
 * 32. Sonoplastia — 1
 * 33. Sonoplastas — 7
 * 34. Ministério da Música — 1
 * 35. Assuntos Públicos e Liberdade Religiosa — 1
 * 
 * REGRAS DOS LIMITES PADRÃO (defaultMaxPerPerson):
 * A quantidade máxima é POR PESSOA e POR DEPARTAMENTO.
 * Representa o número máximo de nomes que UMA pessoa poderá indicar para aquele departamento.
 * O limite NÃO representa o número total de candidatos da reunião.
 * Exemplo: se 30 pessoas participarem e indicarem até 7 nomes para Ancionato,
 * a reunião poderá possuir dezenas de candidatos únicos.
 */
export const CENTRAL_DEPARTMENT_CATALOG: DepartmentCatalogItem[] = [
  { id: 'ancionato', name: 'Ancionato', defaultMaxPerPerson: 7 },
  { id: 'tesoureiro', name: 'Tesoureiro', defaultMaxPerPerson: 1 },
  { id: 'secretario', name: 'Secretário', defaultMaxPerPerson: 1 },
  { id: 'chefe_diaconos', name: 'Chefe dos Diáconos', defaultMaxPerPerson: 1 },
  { id: 'chefe_diaconisas', name: 'Chefe das Diaconisas', defaultMaxPerPerson: 1 },
  { id: 'diacono', name: 'Diácono', defaultMaxPerPerson: 7 },
  { id: 'diaconisa', name: 'Diaconisa', defaultMaxPerPerson: 7 },
  { id: 'escola_sabatina', name: 'Escola Sabatina', defaultMaxPerPerson: 1 },
  { id: 'ministerio_pessoal', name: 'Ministério Pessoal', defaultMaxPerPerson: 1 },
  { id: 'coordenador_pg', name: 'Coordenador de PG', defaultMaxPerPerson: 1 },
  { id: 'coordenador_interessados', name: 'Coordenador de Interessados', defaultMaxPerPerson: 1 },
  { id: 'ministerio_mordomia_crista', name: 'Ministério de Mordomia Cristã', defaultMaxPerPerson: 1 },
  { id: 'ministerio_publicacoes', name: 'Ministério de Publicações', defaultMaxPerPerson: 1 },
  { id: 'ministerio_visitacao', name: 'Ministério da Visitação', defaultMaxPerPerson: 1 },
  { id: 'ministerio_conservacao', name: 'Ministério da Conservação', defaultMaxPerPerson: 1 },
  { id: 'coordenador_espirito_profecia', name: 'Coordenador dos Escritos do Espírito de Profecia', defaultMaxPerPerson: 1 },
  { id: 'ministerio_oracao', name: 'Ministério de Oração', defaultMaxPerPerson: 1 },
  { id: 'ministerio_crianca', name: 'Ministério da Criança', defaultMaxPerPerson: 1 },
  { id: 'ministerio_adolescente', name: 'Ministério do Adolescente', defaultMaxPerPerson: 1 },
  { id: 'ministerio_jovem_adventista', name: 'Ministério Jovem Adventista', defaultMaxPerPerson: 1 },
  { id: 'ministerio_universitarios', name: 'Ministério de Universitários', defaultMaxPerPerson: 1 },
  { id: 'clube_desbravadores', name: 'Clube de Desbravadores', defaultMaxPerPerson: 1 },
  { id: 'clube_aventureiros', name: 'Clube de Aventureiros', defaultMaxPerPerson: 1 },
  { id: 'ministerio_familia', name: 'Ministério da Família', defaultMaxPerPerson: 1 },
  { id: 'asa', name: 'Ação Solidária Adventista (ASA)', defaultMaxPerPerson: 1 },
  { id: 'ministerio_mulher', name: 'Ministério da Mulher', defaultMaxPerPerson: 1 },
  { id: 'ministerio_homens', name: 'Ministério dos Homens', defaultMaxPerPerson: 1 },
  { id: 'map', name: 'Ministério Adventista das Possibilidades (MAP)', defaultMaxPerPerson: 1 },
  { id: 'ministerio_recepcao', name: 'Ministério da Recepção', defaultMaxPerPerson: 1 },
  { id: 'ministerio_saude', name: 'Ministério da Saúde', defaultMaxPerPerson: 1 },
  { id: 'comunicacao', name: 'Comunicação', defaultMaxPerPerson: 1 },
  { id: 'sonoplastia', name: 'Sonoplastia', defaultMaxPerPerson: 1 },
  { id: 'sonoplastas', name: 'Sonoplastas', defaultMaxPerPerson: 7 },
  { id: 'ministerio_musica', name: 'Ministério da Música', defaultMaxPerPerson: 1 },
  { id: 'assuntos_publicos_liberdade_religiosa', name: 'Assuntos Públicos e Liberdade Religiosa', defaultMaxPerPerson: 1 },
];

/**
 * Estrutura extensível de descrições dos 35 departamentos centrais
 * para exibição informativa nos ícones ⓘ das consultas e formulários.
 * Baseado no guia orientador oficial (o que se espera do líder de cada departamento).
 */
export const DEPARTMENT_DESCRIPTIONS: Record<string, string> = {
  ancionato: 'Liderança espiritual, aconselhamento, apoio pastoral e condução dos cultos e comissões da igreja.',
  tesoureiro: 'Gestão fiel, transparente e organizada dos dízimos, ofertas e recursos financeiros da igreja.',
  secretario: 'Registro de membros, atas das comissões, relatórios estatísticos e documentação oficial da igreja.',
  chefe_diaconos: 'Coordenação da equipe de diáconos, manutenção e zelo pelo templo e ordem nos serviços sagrados.',
  chefe_diaconisas: 'Coordenação das diaconisas, preparação das cerimônias (Santa Ceia, Batismo), visitação e acolhimento.',
  diacono: 'Apoio nas cerimônias sagradas, recepção, zelo pelo patrimônio e assistência às necessidades dos membros.',
  diaconisa: 'Apoio nas cerimônias, acolhimento, organização do templo e assistência fraternal às famílias.',
  escola_sabatina: 'Incentivo ao estudo diário da Bíblia e Lição, fortalecimento das Unidades de Ação e comunhão.',
  ministerio_pessoal: 'Mobilização e capacitação da igreja para a pregação do evangelho, estudos bíblicos e testemunho.',
  coordenador_pg: 'Acompanhamento, capacitação e multiplicação dos Pequenos Grupos e do discipulado relacional.',
  coordenador_interessados: 'Acolhimento, triagem e acompanhamento contínuo de pessoas que buscam estudar a Bíblia.',
  ministerio_mordomia_crista: 'Ensino bíblico da fidelidade a Deus no uso do tempo, talentos, corpo e recursos materiais.',
  ministerio_mordomia: 'Ensino bíblico da fidelidade a Deus no uso do tempo, talentos, corpo e recursos materiais.',
  ministerio_publicacoes: 'Incentivo à leitura cristã, disseminação da literatura adventista e promoção dos livros missionários.',
  ministerio_visitacao: 'Planejamento e realização de visitas de apoio espiritual e consolo aos lares e membros.',
  ministerio_conservacao: 'Acolhimento, acompanhamento espiritual e integração ativa dos recém-batizados na comunidade.',
  coordenador_espirito_profecia: 'Promoção da leitura e estudo dos livros e orientações proféticas de Ellen G. White.',
  espirito_profecia: 'Promoção da leitura e estudo dos livros e orientações proféticas de Ellen G. White.',
  ministerio_oracao: 'Fortalecimento da vida de oração intercessória, vigílias e momentos de consagração da igreja.',
  ministerio_crianca: 'Discipulado, educação bíblica e desenvolvimento espiritual das crianças de 0 a 12 anos.',
  ministerio_adolescente: 'Apoio espiritual, aconselhamento e integração ativa dos adolescentes na vida e missão da igreja.',
  ministerio_jovem_adventista: 'Liderança, mobilização evangelística e desenvolvimento espiritual e social dos jovens.',
  ministerio_jovem: 'Liderança, mobilização evangelística e desenvolvimento espiritual e social dos jovens.',
  ministerio_universitarios: 'Apoio espiritual, testemunho no ambiente acadêmico e acolhimento aos estudantes universitários.',
  clube_desbravadores: 'Desenvolvimento integral (físico, mental e espiritual) e cidadania para juvenis de 10 a 15 anos.',
  clube_aventureiros: 'Atividades lúdicas, formação do caráter cristão e apoio às famílias com crianças de 6 a 9 anos.',
  ministerio_familia: 'Fortalecimento dos casamentos, orientação aos pais e promoção de relacionamentos saudáveis no lar.',
  asa: 'Ação Solidária Adventista: assistência social, doação de alimentos e acolhimento aos necessitados da comunidade.',
  ministerio_mulher: 'Fortalecimento espiritual, acolhimento e capacitação missionária e pessoal das mulheres.',
  ministerio_homens: 'Fortalecimento espiritual, comunhão, liderança familiar e engajamento dos homens na missão.',
  map: 'Ministério Adventista das Possibilidades: inclusão, acessibilidade e valorização de pessoas com deficiência e cuidadores.',
  ministerio_recepcao: 'Acolhimento cortês, simpático e organizado de membros e visitantes na entrada da igreja.',
  ministerio_saude: 'Promoção dos princípios bíblicos de saúde, estilo de vida saudável e feiras de saúde comunitárias.',
  comunicacao: 'Divulgação das atividades, produção de avisos, cobertura de eventos e gestão das mídias da igreja.',
  sonoplastia: 'Coordenação, operação técnica de som e áudio com excelência durante os cultos e programações.',
  sonoplastas: 'Operação da mesa de som, microfones e transmissão para garantir clareza sonora nos serviços.',
  ministerio_musica: 'Planejamento e coordenação do louvor congregacional, grupos vocais, corais e ministros de louvor.',
  assuntos_publicos_liberdade_religiosa: 'Promoção e defesa da liberdade religiosa de consciência e relações públicas eclesiásticas.',
};

/**
 * Retorna a descrição oficial e condensada do que se espera do líder do departamento.
 */
export function getDepartmentDescription(deptIdOrName: string, deptName?: string): string {
  if (!deptIdOrName) return '';
  const raw = deptIdOrName.trim().toLowerCase();

  if (DEPARTMENT_DESCRIPTIONS[raw]) {
    return DEPARTMENT_DESCRIPTIONS[raw];
  }

  const aliasId = matchDepartmentAliasToCatalogId(raw);
  if (aliasId && DEPARTMENT_DESCRIPTIONS[aliasId]) {
    return DEPARTMENT_DESCRIPTIONS[aliasId];
  }

  if (deptName) {
    const aliasFromName = matchDepartmentAliasToCatalogId(deptName);
    if (aliasFromName && DEPARTMENT_DESCRIPTIONS[aliasFromName]) {
      return DEPARTMENT_DESCRIPTIONS[aliasFromName];
    }
  }

  return DEPARTMENT_DESCRIPTIONS[deptIdOrName] || `Atividades, coordenação e liderança do ministério de ${deptName || deptIdOrName}.`;
}

/**
 * Gera as configurações padrão de departamentos para uma nova reunião,
 * clonando o catálogo central oficial com todos os 35 departamentos habilitados por padrão
 * e com seus respectivos limites padrão oficiais (7 para Ancionato, Diácono, Diaconisa, Sonoplastas; 1 para os demais).
 */
export function getDefaultMeetingDepartments(): MeetingDepartmentConfig[] {
  return CENTRAL_DEPARTMENT_CATALOG.map((dept) => ({
    departmentId: dept.id,
    name: dept.name,
    enabled: true,
    maxPerPerson: dept.defaultMaxPerPerson,
  }));
}

/**
 * Mapeamento central de nomenclatura inclusiva para títulos e departamentos de pautas.
 * Aplica às funções/cargos já estabelecidos:
 * - Tesoureiro(a)
 * - Secretário(a)
 * - Coordenador(a) de PG
 * - Coordenador(a) de Interessados
 * - Coordenador(a) dos Escritos do Espírito de Profecia
 */
export const DEPARTMENT_INCLUSIVE_POLL_NAMES: Record<string, string> = {
  tesoureiro: 'Tesoureiro(a)',
  secretario: 'Secretário(a)',
  coordenador_pg: 'Coordenador(a) de PG',
  coordenador_interessados: 'Coordenador(a) de Interessados',
  coordenador_espirito_profecia: 'Coordenador(a) dos Escritos do Espírito de Profecia',
  'Tesoureiro': 'Tesoureiro(a)',
  'Secretário': 'Secretário(a)',
  'Coordenador de PG': 'Coordenador(a) de PG',
  'Coordenador de Interessados': 'Coordenador(a) de Interessados',
  'Coordenador dos Escritos do Espírito de Profecia': 'Coordenador(a) dos Escritos do Espírito de Profecia',
};

export function getDepartmentPollDisplayName(deptIdOrName: string): string {
  if (!deptIdOrName) return '';
  const trimmed = deptIdOrName.trim();
  const lower = trimmed.toLowerCase();

  if (DEPARTMENT_INCLUSIVE_POLL_NAMES[lower]) {
    return DEPARTMENT_INCLUSIVE_POLL_NAMES[lower];
  }
  if (DEPARTMENT_INCLUSIVE_POLL_NAMES[trimmed]) {
    return DEPARTMENT_INCLUSIVE_POLL_NAMES[trimmed];
  }
  return trimmed;
}

/**
 * REGRA OFICIAL (Regra 11):
 * Os seguintes departamentos NÃO possuem associados:
 * 1. Funcionário
 * 2. Chefe dos Diáconos
 * 3. Chefe das Diaconisas
 * 4. Diácono
 * 5. Diaconisa
 *
 * Para esses departamentos:
 * - NÃO mostrar botão ASSOCIADOS;
 * - NÃO permitir cadastro de associados;
 * - NÃO permitir votação de associados;
 * - NÃO incluir campo/estrutura de associados.
 */
export function canDepartmentHaveAssociates(deptIdOrName?: string | null): boolean {
  if (!deptIdOrName) return false;
  const raw = deptIdOrName.trim().toLowerCase();
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // remove acentos

  // 0. Comissão Organizadora criteria never have associates
  if (raw.startsWith('org_') || normalized.includes('comissao organizadora')) {
    return false;
  }

  // 1. Funcionário
  if (normalized.includes('funcionario') || normalized.includes('funcionaria')) {
    return false;
  }
  // 2. Chefe dos Diáconos
  if (normalized.includes('chefe') && normalized.includes('diacono')) {
    return false;
  }
  // 3. Chefe das Diaconisas
  if (normalized.includes('chefe') && normalized.includes('diaconisa')) {
    return false;
  }
  // 4. Diácono (exato ou plural, mas não chefe)
  if (
    normalized === 'diacono' ||
    normalized === 'diaconos' ||
    raw === 'diacono' ||
    raw === 'diácono' ||
    raw === 'diáconos'
  ) {
    return false;
  }
  // 5. Diaconisa (exato ou plural, mas não chefe)
  if (
    normalized === 'diaconisa' ||
    normalized === 'diaconisas' ||
    raw === 'diaconisa' ||
    raw === 'diaconisas'
  ) {
    return false;
  }

  // IDs oficiais específicos
  if (
    raw === 'chefe_diaconos' ||
    raw === 'chefe_diaconisas' ||
    raw === 'diacono' ||
    raw === 'diaconisa' ||
    raw === 'funcionario'
  ) {
    return false;
  }

  return true;
}

/**
 * Formata o nome de um critério da Comissão Organizadora para o título da pauta:
 * Ex: "HOMENS" -> "Comissão Organizadora — Homens"
 *     "MULHERES" -> "Comissão Organizadora — Mulheres"
 *     "JOVENS" -> "Comissão Organizadora — Jovens"
 */
export function formatOrganizingCriterionPollTitle(criterionName: string): string {
  const cleaned = (criterionName || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'Comissão Organizadora';
  const titleCased = cleaned
    .toLowerCase()
    .split(' ')
    .map((word, idx) => {
      if (idx > 0 && ['de', 'da', 'do', 'das', 'dos', 'e'].includes(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
  return `Comissão Organizadora — ${titleCased}`;
}

/**
 * Normaliza e identifica o ID canônico oficial do departamento a partir de qualquer
 * texto, variação, gênero ou grafia (ex: "Secretária", "Secretaria", "Secretário(a)", "Anciãos", etc).
 */
export function matchDepartmentAliasToCatalogId(text: string): string | null {
  if (!text) return null;
  const raw = text.trim().toLowerCase();
  const norm = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Guard: never match Comissão Organizadora criteria or polls to church departments
  if (raw.startsWith('org_') || norm.includes('comissao organizadora')) {
    return null;
  }

  if (norm.includes('tesourari') || norm.includes('tesoureir')) return 'tesoureiro';
  if (norm.includes('secretari') || norm.includes('secretar')) return 'secretario';
  if (norm.includes('anciao') || norm.includes('ancionato')) return 'ancionato';
  if (norm.includes('chefe') && norm.includes('diacon')) {
    if (norm.includes('diaconis')) return 'chefe_diaconisas';
    return 'chefe_diaconos';
  }
  if (norm.includes('diaconis')) return 'diaconisa';
  if (norm.includes('diacon')) return 'diacono';
  if (norm.includes('escola sabatina')) return 'escola_sabatina';
  if (norm.includes('pessoal') || norm.includes('ministerio pessoal')) return 'ministerio_pessoal';
  if (norm.includes('pequeno grupo') || norm.includes('pequenos grupos') || (norm.includes('coordenador') && norm.includes('pg'))) return 'coordenador_pg';
  if (norm.includes('interessado')) return 'coordenador_interessados';
  if (norm.includes('mordomia')) return 'ministerio_mordomia_crista';
  if (norm.includes('publicaco') || norm.includes('publicacoes')) return 'ministerio_publicacoes';
  if (norm.includes('visitaco') || norm.includes('visitacao')) return 'ministerio_visitacao';
  if (norm.includes('conservaco') || norm.includes('conservacao')) return 'ministerio_conservacao';
  if (norm.includes('espirito de profecia') || norm.includes('espírito de profecia')) return 'coordenador_espirito_profecia';
  if (norm.includes('oraco') || norm.includes('oracao')) return 'ministerio_oracao';
  if (norm.includes('crianca')) return 'ministerio_crianca';
  if (norm.includes('adolescente')) return 'ministerio_adolescente';
  if (norm.includes('jovem') || norm.includes('ja')) return 'ministerio_jovem_adventista';
  if (norm.includes('universitari')) return 'ministerio_universitarios';
  if (norm.includes('desbravador')) return 'clube_desbravadores';
  if (norm.includes('aventureir')) return 'clube_aventureiros';
  if (norm.includes('familia')) return 'ministerio_familia';
  if (norm.includes('asa') || norm.includes('acao solidaria') || norm.includes('assistencia social')) return 'asa';
  if (norm.includes('mulher')) return 'ministerio_mulher';
  if (norm.includes('homem') || norm.includes('homens')) return 'ministerio_homens';
  if (norm.includes('map') || norm.includes('possibilidades')) return 'map';
  if (norm.includes('recepco') || norm.includes('recepcao')) return 'ministerio_recepcao';
  if (norm.includes('saude')) return 'ministerio_saude';
  if (norm.includes('comunicaco') || norm.includes('comunicacao')) return 'comunicacao';
  if (norm.includes('sonoplasta') && !norm.includes('sonoplastia')) return 'sonoplastas';
  if (norm.includes('sonoplastia') || norm.includes('som')) return 'sonoplastia';
  if (norm.includes('musica')) return 'ministerio_musica';
  if (norm.includes('liberdade religiosa') || norm.includes('assuntos publicos') || norm.includes('assuntos públicos')) return 'assuntos_publicos_liberdade_religiosa';

  return null;
}

export interface CanonicalDepartmentResolution {
  departmentId: string;
  departmentName: string;
  orderIndex: number;
}

/**
 * Resolve e canoniza qualquer identificador ou texto de departamento
 * priorizando:
 * 1. departmentId / ID canônico no catálogo da reunião
 * 2. Aliases conhecidos e normalizações
 * 3. Match de nome no catálogo
 * 4. Posição oficial no catálogo (1..35)
 */
export function resolveCanonicalDepartment(
  deptIdOrName: string | undefined,
  meetingCatalog?: Array<{ departmentId?: string; id?: string; name: string }>
): CanonicalDepartmentResolution {
  const catalog = (meetingCatalog && meetingCatalog.length > 0)
    ? meetingCatalog
    : CENTRAL_DEPARTMENT_CATALOG.map((d) => ({ departmentId: d.id, id: d.id, name: d.name }));

  if (!deptIdOrName || !deptIdOrName.trim()) {
    return {
      departmentId: 'outro',
      departmentName: 'Outro',
      orderIndex: 99999,
    };
  }

  const raw = deptIdOrName.trim();
  const lower = raw.toLowerCase();
  const norm = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Guard: never resolve Comissão Organizadora criteria or polls into church departments
  if (lower.startsWith('org_') || norm.includes('comissao organizadora')) {
    return {
      departmentId: lower.startsWith('org_') ? lower : `org_${lower.replace(/\s+/g, '_')}`,
      departmentName: raw,
      orderIndex: 95000,
    };
  }

  // 1. Direct ID match in meeting catalog
  const idIdx = catalog.findIndex((d) => {
    const id = (d.departmentId || d.id || '').trim().toLowerCase();
    return id && (id === lower || id === norm);
  });
  if (idIdx !== -1) {
    const catItem = catalog[idIdx];
    const canonicalId = catItem.departmentId || catItem.id || lower;
    return {
      departmentId: canonicalId,
      departmentName: getDepartmentPollDisplayName(catItem.name),
      orderIndex: idIdx,
    };
  }

  // 2. Alias match to central catalog
  const aliasId = matchDepartmentAliasToCatalogId(raw);
  if (aliasId) {
    const aliasIdx = catalog.findIndex((d) => {
      const id = (d.departmentId || d.id || '').trim().toLowerCase();
      return id === aliasId.toLowerCase();
    });
    if (aliasIdx !== -1) {
      const catItem = catalog[aliasIdx];
      return {
        departmentId: catItem.departmentId || catItem.id || aliasId,
        departmentName: getDepartmentPollDisplayName(catItem.name),
        orderIndex: aliasIdx,
      };
    }
    const centralItem = CENTRAL_DEPARTMENT_CATALOG.find((c) => c.id === aliasId);
    if (centralItem) {
      const centralIdx = CENTRAL_DEPARTMENT_CATALOG.indexOf(centralItem);
      return {
        departmentId: centralItem.id,
        departmentName: getDepartmentPollDisplayName(centralItem.name),
        orderIndex: centralIdx,
      };
    }
  }

  // 3. Name or Display Name match in meeting catalog
  const nameIdx = catalog.findIndex((d) => {
    const dName = (d.name || '').trim().toLowerCase();
    const dNorm = dName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const dDisplay = getDepartmentPollDisplayName(d.name).trim().toLowerCase();
    const dDisplayNorm = dDisplay.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return (
      dName === lower ||
      dNorm === norm ||
      dDisplay === lower ||
      dDisplayNorm === norm ||
      lower.includes(dName) ||
      norm.includes(dNorm)
    );
  });
  if (nameIdx !== -1) {
    const catItem = catalog[nameIdx];
    return {
      departmentId: catItem.departmentId || catItem.id || lower,
      departmentName: getDepartmentPollDisplayName(catItem.name),
      orderIndex: nameIdx,
    };
  }

  // 4. Central catalog fallback match by name
  const centralIdx = CENTRAL_DEPARTMENT_CATALOG.findIndex((c) => {
    const cId = c.id.toLowerCase();
    if (cId === lower) return true;
    const cName = c.name.toLowerCase();
    const cNorm = cName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const cDisplay = getDepartmentPollDisplayName(c.name).toLowerCase();
    const cDisplayNorm = cDisplay.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return (
      cName === lower ||
      cNorm === norm ||
      cDisplay === lower ||
      cDisplayNorm === norm ||
      lower.includes(cName) ||
      norm.includes(cNorm)
    );
  });
  if (centralIdx !== -1) {
    const centralItem = CENTRAL_DEPARTMENT_CATALOG[centralIdx];
    return {
      departmentId: centralItem.id,
      departmentName: getDepartmentPollDisplayName(centralItem.name),
      orderIndex: centralIdx,
    };
  }

  // Fallback for custom department
  return {
    departmentId: lower.replace(/\s+/g, '_'),
    departmentName: getDepartmentPollDisplayName(raw),
    orderIndex: 90000,
  };
}

