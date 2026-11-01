import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Trash2,
  Check,
  Search,
  User as UserIcon,
  RotateCcw,
  Send,
  Info,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  ArrowLeft,
  X,
} from 'lucide-react';
import { PublicChurchNominationData, ChurchNominatedPerson } from '../types';
import { fetchPublicChurchNominationState, submitChurchNomination } from '../services/api';
import { getDepartmentDescription, DEPARTMENT_DESCRIPTIONS } from '../constants/departments';
import { extractBaseMeetingName } from '../utils/meetingTitle';

interface ChurchNominationPublicViewProps {
  token: string;
}

export const ChurchNominationPublicView: React.FC<ChurchNominationPublicViewProps> = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<PublicChurchNominationData | null>(null);

  // Flow step: 1 = Identification & Interest, 2 = Intermediate Question, 3 = Recommendations, 4 = Success
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Form states
  const [participantName, setParticipantName] = useState('');
  const [selectedDepts, setSelectedDepts] = useState<Set<string>>(new Set());
  const [deptSearch, setDeptSearch] = useState('');

  // Nominations map: departmentId -> array of string names
  const [nominationsByDept, setNominationsByDept] = useState<Record<string, string[]>>({});

  // Active popover for department info (departmentId | null)
  const [activeInfoDeptId, setActiveInfoDeptId] = useState<string | null>(null);

  // Submit states
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Draft auto-save status indicator ('idle' | 'saved')
  const [draftSavedStatus, setDraftSavedStatus] = useState<boolean>(false);
  const draftLoadedRef = useRef(false);

  const DRAFT_STORAGE_KEY = useMemo(() => `church_nomination_draft_${token}`, [token]);

  // Load draft from localStorage on mount (once)
  useEffect(() => {
    if (draftLoadedRef.current) return;
    try {
      const savedRaw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        if (parsed && typeof parsed === 'object') {
          if (typeof parsed.participantName === 'string') {
            setParticipantName(parsed.participantName);
          }
          if (Array.isArray(parsed.selectedDepts)) {
            setSelectedDepts(new Set(parsed.selectedDepts));
          }
          if (parsed.nominationsByDept && typeof parsed.nominationsByDept === 'object') {
            setNominationsByDept(parsed.nominationsByDept);
          }
          if (parsed.currentStep && [1, 2, 3].includes(parsed.currentStep)) {
            setCurrentStep(parsed.currentStep as 1 | 2 | 3);
          }
        }
      }
    } catch {
      // Ignore localStorage errors (e.g. private mode or corrupted JSON)
    } finally {
      draftLoadedRef.current = true;
    }
  }, [DRAFT_STORAGE_KEY]);

  // Auto-save draft whenever form state changes (debounced/smooth)
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    // Do not save draft if already on step 4 (success)
    if (currentStep === 4) return;

    // Check if there is anything worth saving
    const hasData =
      participantName.trim().length > 0 ||
      selectedDepts.size > 0 ||
      currentStep > 1 ||
      Object.values(nominationsByDept).some((names: string[]) =>
        Array.isArray(names) && names.some((n) => typeof n === 'string' && n.trim().length > 0)
      );

    if (!hasData) {
      return;
    }

    const timer = setTimeout(() => {
      try {
        const payload = {
          participantName,
          selectedDepts: Array.from(selectedDepts),
          nominationsByDept,
          currentStep,
          updatedAt: Date.now(),
        };
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
        setDraftSavedStatus(true);
        setTimeout(() => setDraftSavedStatus(false), 2000);
      } catch {
        // Ignore quota errors
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [participantName, selectedDepts, nominationsByDept, currentStep, DRAFT_STORAGE_KEY]);

  const loadState = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPublicChurchNominationState(token);
      setState(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Não foi possível carregar as informações.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadState();
  }, [token]);

  // Close info popover when clicking outside
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.dept-info-popover') && !target.closest('.dept-info-btn')) {
        setActiveInfoDeptId(null);
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // Filtered departments for interest selection
  const filteredDepartments = useMemo(() => {
    if (!state?.departments) return [];
    const query = deptSearch.trim().toLowerCase();
    if (!query) return state.departments;
    return state.departments.filter((d) => d.name.toLowerCase().includes(query));
  }, [state?.departments, deptSearch]);

  const toggleDeptInterest = (id: string) => {
    setSelectedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Step 1 validation & proceed
  const handleProceedFromInterest = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const cleanName = participantName.trim();
    if (!cleanName) {
      setSubmitError('Por favor, informe seu nome para continuar.');
      return;
    }
    setCurrentStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Recommendation field handlers (unlimited recommendations per department)
  const handleAddNominee = (deptId: string) => {
    setNominationsByDept((prev) => {
      const currentList = prev[deptId] || [''];
      return {
        ...prev,
        [deptId]: [...currentList, ''],
      };
    });
  };

  const handleUpdateNominee = (deptId: string, index: number, value: string) => {
    setNominationsByDept((prev) => {
      const currentList = prev[deptId] ? [...prev[deptId]] : [''];
      currentList[index] = value;
      return {
        ...prev,
        [deptId]: currentList,
      };
    });
  };

  const handleRemoveNominee = (deptId: string, index: number) => {
    setNominationsByDept((prev) => {
      const currentList = prev[deptId] ? [...prev[deptId]] : [];
      const updated = currentList.filter((_, i) => i !== index);
      return {
        ...prev,
        [deptId]: updated.length > 0 ? updated : [''],
      };
    });
  };

  // Build and execute final submission
  const executeSubmission = async (includeRecommendations: boolean) => {
    setSubmitError(null);
    const cleanName = participantName.trim();
    if (!cleanName) {
      setSubmitError('Por favor, informe seu nome para continuar.');
      setCurrentStep(1);
      return;
    }

    const validNominations: ChurchNominatedPerson[] = [];
    if (includeRecommendations && state?.departments) {
      for (const [deptId, rawNames] of Object.entries(nominationsByDept)) {
        const names = (rawNames as string[]) || [];
        const deptObj = state.departments.find((d) => d.id === deptId);
        const deptName = deptObj ? deptObj.name : deptId;
        for (const name of names) {
          const cleanNomineeName = name.trim();
          if (cleanNomineeName) {
            validNominations.push({
              departmentId: deptId,
              departmentName: deptName,
              personName: cleanNomineeName,
            });
          }
        }
      }
    }

    setSubmitting(true);
    try {
      await submitChurchNomination(token, {
        participantName: cleanName,
        selectedDepartments: Array.from(selectedDepts),
        nominations: validNominations,
      });
      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        // ignore
      }
      setCurrentStep(4);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao registrar suas recomendações.';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Active department for floating info modal
  const activeInfoDept = useMemo(() => {
    if (!activeInfoDeptId || !state?.departments) return null;
    return state.departments.find((d) => d.id === activeInfoDeptId) || null;
  }, [activeInfoDeptId, state?.departments]);

  const meetingWithChurchTitle = useMemo(() => {
    if (!state) return '';
    const { baseName, congregation } = extractBaseMeetingName(
      state.meetingName,
      state.nominationCommissionName
    );
    return congregation ? `${baseName} — ${congregation}` : baseName;
  }, [state]);

  // Loading state
  if (loading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 flex flex-col items-center justify-center text-center">
        <div className="w-10 h-10 border-3 border-[#111827] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-[#4B5563]">Carregando formulário de recomendações...</p>
      </div>
    );
  }

  // Error / Closed / Expired states
  if (error || !state || !state.valid) {
    const isExpired = state?.status === 'EXPIRED';
    const isClosed = state?.status === 'CLOSED';
    const isNotFound = state?.status === 'NOT_FOUND' || !state;

    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white rounded-3xl border border-[#E5E7EB] p-8 text-center shadow-xs space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F3F4F6] text-[#4B5563] flex items-center justify-center">
            {isExpired ? (
              <Clock className="w-7 h-7 text-[#D97706]" />
            ) : (
              <AlertCircle className="w-7 h-7 text-[#6B7280]" />
            )}
          </div>

          <h2 className="text-xl font-bold text-[#111827] tracking-tight">
            {isExpired
              ? 'PRAZO ENCERRADO'
              : isClosed
              ? 'RECOMENDAÇÕES ENCERRADAS'
              : isNotFound
              ? 'LINK NÃO ENCONTRADO'
              : 'RECOMENDAÇÕES INDISPONÍVEIS'}
          </h2>

          <p className="text-sm text-[#4B5563] leading-relaxed">
            {isExpired
              ? 'O prazo estabelecido para envio de recomendações desta congregação expirou.'
              : isClosed
              ? 'O período de consulta à igreja foi finalizado pela administração.'
              : isNotFound
              ? 'O link acessado é inválido ou não está mais ativo.'
              : error || 'Esta consulta não está aceitando novos envios no momento.'}
          </p>

          <button
            type="button"
            onClick={loadState}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#111827] font-semibold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  // STEP 4: Success view
  if (currentStep === 4) {
    const totalNominationsCount = Object.values(nominationsByDept).reduce<number>(
      (acc, rawList) => {
        const list = (rawList as string[]) || [];
        return acc + list.filter((n) => n.trim().length > 0).length;
      },
      0
    );

    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white rounded-3xl border border-[#E5E7EB] p-8 text-center shadow-xs space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#ECFDF5] text-[#059669] flex items-center justify-center border border-[#A7F3D0]">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <h2 className="text-2xl font-bold text-[#111827] tracking-tight">
              Recomendações Registradas!
            </h2>
            <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wider mt-1">
              {meetingWithChurchTitle}
            </p>
          </div>

          <p className="text-sm text-[#4B5563] leading-relaxed">
            Obrigado, <strong className="text-[#111827]">{participantName}</strong>! Suas respostas foram salvas com sucesso e apoiarão os trabalhos e orações da Comissão de Nomeações.
          </p>

          <div className="bg-[#F9FAFB] rounded-2xl p-4 border border-[#E5E7EB] text-left space-y-2 text-xs text-[#4B5563]">
            {selectedDepts.size > 0 ? (
              <div>
                <span className="font-semibold text-[#111827]">Áreas de Interesse:</span>{' '}
                {Array.from(selectedDepts)
                  .map((id) => state.departments.find((d) => d.id === id)?.name || id)
                  .join(', ')}
              </div>
            ) : (
              <div>
                <span className="font-semibold text-[#6B7280]">Áreas de Interesse:</span> Nenhuma selecionada
              </div>
            )}

            {totalNominationsCount > 0 && (
              <div>
                <span className="font-semibold text-[#111827]">Pessoas Recomendadas:</span>{' '}
                {totalNominationsCount} {totalNominationsCount === 1 ? 'membro recomendado' : 'membros recomendados'}
              </div>
            )}
          </div>

          <p className="text-xs text-[#9CA3AF]">
            Você pode fechar esta página com segurança.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 sm:py-10 space-y-6">
      {/* Informative Header Card (Zero heart icon) */}
      <div className="bg-white rounded-3xl border border-[#E5E7EB] p-6 sm:p-8 shadow-xs space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight">
              RECOMENDAÇÕES DA IGREJA
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[#4B5563] bg-[#F9FAFB] p-2.5 rounded-xl border border-[#E5E7EB] mt-2">
              <strong className="text-[#111827]">{meetingWithChurchTitle}</strong>
            </div>
          </div>
          {draftSavedStatus && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F3F4F6] text-[#4B5563] text-[11px] font-medium shrink-0 animate-in fade-in duration-200">
              <Check className="w-3 h-3 text-[#059669]" />
              <span>Rascunho salvo</span>
            </div>
          )}
        </div>

        <p className="text-sm text-[#4B5563] leading-relaxed pt-1">
          Esta consulta permite que você informe as áreas em que se identifica e recomende outras pessoas para os demais ministérios e funções.
        </p>

        {state.deadline && (
          <div className="flex items-center gap-2 text-xs font-medium text-[#6B7280] pt-2 border-t border-[#F3F4F6]">
            <Clock className="w-3.5 h-3.5 text-[#D97706]" />
            <span>
              Prazo limite:{' '}
              <strong className="text-[#111827]">
                {new Date(state.deadline).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </strong>
            </span>
          </div>
        )}
      </div>

      {submitError && (
        <div className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-2xl text-xs text-[#DC2626] font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      {/* ========================================================
          STEP 1: IDENTIFICAÇÃO & MANIFESTAÇÃO DE INTERESSE
         ======================================================== */}
      {currentStep === 1 && (
        <form onSubmit={handleProceedFromInterest} className="space-y-6">
          {/* Card 1: Identificação */}
          <div className="bg-white rounded-3xl border border-[#E5E7EB] p-6 shadow-xs space-y-3">
            <label className="block text-sm font-bold text-[#111827]">
              SEU NOME <span className="text-[#EF4444]">*</span>
            </label>
            <div className="relative">
              <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
              <input
                type="text"
                required
                value={participantName}
                onChange={(e) => setParticipantName(e.target.value)}
                placeholder="Digite seu nome e sobrenome"
                className="w-full pl-10 pr-4 py-3 bg-[#F9FAFB] border border-[#D1D5DB] rounded-2xl text-sm font-medium text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#111827] transition"
              />
            </div>
            <p className="text-[11px] text-[#6B7280]">
              Seu nome é necessário para identificar suas sugestões e recomendações.
            </p>
          </div>

          {/* Card 2: Áreas de Interesse (Lista Vertical de Cards Modernos) */}
          <div className="bg-white rounded-3xl border border-[#E5E7EB] p-6 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-bold text-[#111827]">
                Áreas que você gostaria de servir
              </h2>
              <p className="text-xs text-[#6B7280] mt-0.5">
                Selecione os departamentos e ministérios com os quais você se identifica.
              </p>
            </div>

            {/* Quick Search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
              <input
                type="text"
                value={deptSearch}
                onChange={(e) => setDeptSearch(e.target.value)}
                placeholder="Buscar ministério (ex: Diaconato, Jovem, Música...)"
                className="w-full pl-10 pr-4 py-2.5 bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl text-xs font-medium text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#111827]"
              />
            </div>

            {/* Lista Vertical de Cards por Departamento */}
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {filteredDepartments.map((dept) => {
                const isChecked = selectedDepts.has(dept.id);
                const isInfoOpen = activeInfoDeptId === dept.id;
                const deptDescription = getDepartmentDescription(dept.id, dept.name);

                return (
                  <div
                    key={dept.id}
                    onClick={() => toggleDeptInterest(dept.id)}
                    className={`relative p-3.5 rounded-2xl border transition cursor-pointer select-none flex items-center justify-between gap-3 ${
                      isChecked
                        ? 'bg-[#111827] text-white border-[#111827] shadow-xs'
                        : 'bg-[#F9FAFB] text-[#111827] border-[#E5E7EB] hover:border-[#D1D5DB] hover:bg-white'
                    }`}
                  >
                    {/* Checkbox + Nome */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${
                          isChecked
                            ? 'bg-white border-white text-[#111827]'
                            : 'bg-white border-[#D1D5DB]'
                        }`}
                      >
                        {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                      <span className="text-xs sm:text-sm font-semibold truncate">
                        {dept.name}
                      </span>
                    </div>

                    {/* Botão de Informação ⓘ Independente */}
                    <button
                      type="button"
                      aria-label={`Informações sobre ${dept.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveInfoDeptId(dept.id);
                      }}
                      className={`dept-info-btn w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition cursor-pointer ${
                        isChecked
                          ? 'text-white/80 hover:text-white hover:bg-white/10'
                          : 'text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F3F4F6]'
                      }`}
                    >
                      <Info className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            {selectedDepts.size > 0 ? (
              <div className="text-xs text-[#059669] font-medium bg-[#ECFDF5] px-3.5 py-2 rounded-xl border border-[#A7F3D0]">
                ✓ {selectedDepts.size} {selectedDepts.size === 1 ? 'área selecionada' : 'áreas selecionadas'}
              </div>
            ) : (
              <div className="text-xs text-[#6B7280] italic">
                Nenhuma área selecionada (você pode continuar sem selecionar).
              </div>
            )}
          </div>

          {/* Botão de Avanço */}
          <button
            type="submit"
            className="w-full py-4 bg-[#111827] hover:bg-[#1F2937] active:scale-[0.99] text-white font-bold text-sm uppercase tracking-wider rounded-2xl shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <span>CONTINUAR</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      )}

      {/* ========================================================
          STEP 2: ETAPA INTERMEDIÁRIA — QUER RECOMENDAR PESSOAS?
         ======================================================== */}
      {currentStep === 2 && (
        <div className="bg-white rounded-3xl border border-[#E5E7EB] p-8 text-center shadow-xs space-y-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F3F4F6] text-[#111827] flex items-center justify-center">
            <Users className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold text-[#111827] tracking-tight">
              QUER RECOMENDAR PESSOAS?
            </h2>
            <p className="text-sm text-[#4B5563] max-w-md mx-auto leading-relaxed">
              Se desejar, recomende pessoas que você considera preparadas para servir em algum dos departamentos.
            </p>
          </div>

          <div className="pt-2 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setCurrentStep(3);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="w-full sm:w-auto px-8 py-3.5 bg-[#111827] hover:bg-[#1F2937] active:scale-[0.99] text-white font-bold text-xs uppercase tracking-wider rounded-2xl transition cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
            >
              <span>RECOMENDAR PESSOAS</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={() => {
                setCurrentStep(1);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="text-xs text-[#6B7280] hover:text-[#111827] inline-flex items-center gap-1 cursor-pointer font-medium transition"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>Voltar e alterar áreas de interesse</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          STEP 3: ETAPA DE RECOMENDAÇÃO DE PESSOAS
         ======================================================== */}
      {currentStep === 3 && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-[#E5E7EB] p-6 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#111827]">
                Recomendação de Pessoas
              </h2>
              <button
                type="button"
                onClick={() => {
                  setCurrentStep(2);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="text-xs text-[#6B7280] hover:text-[#111827] flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar</span>
              </button>
            </div>
            <p className="text-xs text-[#6B7280] leading-relaxed">
              Digite os nomes das pessoas que você recomenda para servir nos departamentos. Nenhuma recomendação é obrigatória.
            </p>
          </div>

          {/* Lista de todos os departamentos disponíveis */}
          <div className="space-y-3">
            {state.departments.map((dept) => {
              const names = nominationsByDept[dept.id] || [''];

              return (
                <div
                  key={dept.id}
                  className="bg-white rounded-3xl border border-[#E5E7EB] p-5 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[#111827] uppercase tracking-wide">
                      {dept.name}
                    </span>
                    <button
                      type="button"
                      aria-label={`Informações sobre ${dept.name}`}
                      onClick={() => setActiveInfoDeptId(dept.id)}
                      className="dept-info-btn w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F3F4F6] transition cursor-pointer"
                    >
                      <Info className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {names.map((nomineeName, idx) => (
                      <div key={idx} className="space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                          NOME DE QUEM VOCÊ RECOMENDA
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={nomineeName}
                            onChange={(e) => handleUpdateNominee(dept.id, idx, e.target.value)}
                            placeholder="Digite o nome"
                            className="flex-1 px-3.5 py-2.5 bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl text-xs font-medium text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#111827]"
                          />
                          {names.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveNominee(dept.id, idx)}
                              className="p-2 text-[#EF4444] hover:bg-[#FEE2E2] rounded-xl transition cursor-pointer shrink-0"
                              title="Remover"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Botão + RECOMENDAR OUTRO MEMBRO: exibido apenas para departamentos coletivos (configurados na Comissão para mais de 1 pessoa) */}
                  {(dept.maxPerPerson === undefined || dept.maxPerPerson > 1) && (
                    <button
                      type="button"
                      onClick={() => handleAddNominee(dept.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#111827] bg-[#F3F4F6] hover:bg-[#E5E7EB] rounded-xl transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>RECOMENDAR OUTRO MEMBRO</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Botão Final de Envio */}
          <div className="pt-4 sticky bottom-4">
            <button
              type="button"
              disabled={submitting}
              onClick={() => executeSubmission(true)}
              className="w-full py-4 bg-[#111827] hover:bg-[#1F2937] active:scale-[0.99] text-white font-bold text-sm uppercase tracking-wider rounded-2xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Enviando Recomendações...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>ENVIAR MINHAS RECOMENDAÇÕES</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: INFORMAÇÕES DO DEPARTAMENTO (POPOVER NÃO-CORTADO)
         ======================================================== */}
      {activeInfoDept && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-2xs"
          onClick={() => setActiveInfoDeptId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl border border-[#E5E7EB] p-5 sm:p-6 max-w-sm w-full shadow-2xl space-y-3 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between border-b border-[#F3F4F6] pb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-[#F3F4F6] text-[#111827] flex items-center justify-center shrink-0">
                  <Info className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="font-bold text-sm text-[#111827] block truncate">
                    {activeInfoDept.name}
                  </span>
                  <span className="text-[10px] text-[#6B7280] font-medium block">
                    O que se espera do líder deste departamento?
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveInfoDeptId(null)}
                className="p-1.5 text-[#9CA3AF] hover:text-[#111827] rounded-xl hover:bg-[#F3F4F6] transition cursor-pointer shrink-0 ml-2"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#4B5563] leading-relaxed">
              {getDepartmentDescription(activeInfoDept.id, activeInfoDept.name)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
