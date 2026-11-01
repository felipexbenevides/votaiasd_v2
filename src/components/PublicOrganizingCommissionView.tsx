import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Plus,
  Trash2,
  Send,
  ArrowRight,
  User,
} from 'lucide-react';
import { PublicOrganizingCommissionState } from '../types';
import {
  fetchPublicOrganizingCommissionState,
  startOrganizingParticipantSession,
  fetchParticipantOrganizingNominations,
  saveParticipantOrganizingNominations,
  finalizeParticipantOrganizingNominations,
} from '../services/api';
import { ChurchLogo } from './ChurchLogo';
import { extractBaseMeetingName } from '../utils/meetingTitle';

interface PublicOrganizingCommissionViewProps {
  token: string;
}

function getOrCreateLocalOrganizingSessionId(token: string): string {
  const storageKey = `votaiasd_org_session_${token}`;
  let existing = localStorage.getItem(storageKey);
  if (!existing || !existing.startsWith('orgsess_')) {
    const rand = Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    existing = `orgsess_${rand}`;
    localStorage.setItem(storageKey, existing);
  }
  return existing;
}

function getLocalParticipantNameKey(token: string): string {
  return `votaiasd_org_participant_name_${token}`;
}

function formatDeadline(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const PublicOrganizingCommissionView: React.FC<
  PublicOrganizingCommissionViewProps
> = ({ token }) => {
  const [state, setState] = useState<PublicOrganizingCommissionState | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [participantName, setParticipantName] = useState<string>('');
  const [isIdentified, setIsIdentified] = useState<boolean>(false);
  const [isStartingSession, setIsStartingSession] = useState<boolean>(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [draftNominations, setDraftNominations] = useState<Record<string, string[]>>({});
  const [isSubmittingAll, setIsSubmittingAll] = useState<boolean>(false);
  const [isFinalized, setIsFinalized] = useState<boolean>(false);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadPublicData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const localSessId = getOrCreateLocalOrganizingSessionId(token);
      setSessionId(localSessId);

      const nameKey = getLocalParticipantNameKey(token);
      const storedName = (
        localStorage.getItem(nameKey) ||
        sessionStorage.getItem(nameKey) ||
        ''
      )
        .trim()
        .replace(/\s+/g, ' ');
      if (storedName) {
        setParticipantName(storedName);
      }

      const pubState = await fetchPublicOrganizingCommissionState(token, localSessId);
      setState(pubState);

      const resolvedName = (pubState.participantName || storedName || '')
        .trim()
        .replace(/\s+/g, ' ');
      if (resolvedName) {
        setParticipantName(resolvedName);
        localStorage.setItem(nameKey, resolvedName);
        sessionStorage.setItem(nameKey, resolvedName);
      }

      if (pubState.sessionFinalized || pubState.hasSubmitted) {
        setIsIdentified(true);
        setIsFinalized(true);
        return;
      }

      if (pubState.valid && pubState.status === 'OPEN') {
        const defaultDrafts: Record<string, string[]> = {};
        for (const crit of pubState.criteria || []) {
          defaultDrafts[crit.criterionId] = [''];
        }
        setDraftNominations(defaultDrafts);

        if (resolvedName) {
          try {
            const sessResp = await startOrganizingParticipantSession(
              token,
              resolvedName,
              localSessId
            );
            if (sessResp.nominatorName) {
              setParticipantName(sessResp.nominatorName);
              localStorage.setItem(nameKey, sessResp.nominatorName);
              sessionStorage.setItem(nameKey, sessResp.nominatorName);
            }
            if (sessResp.finalized) {
              setIsIdentified(true);
              setIsFinalized(true);
              return;
            }
            const sessionData = await fetchParticipantOrganizingNominations(
              token,
              localSessId
            );
            if (sessionData.finalized) {
              setIsIdentified(true);
              setIsFinalized(true);
              return;
            }
            setIsIdentified(true);
          } catch (err: unknown) {
            if ((err as any)?.status === 'ALREADY_SUBMITTED') {
              setIsIdentified(true);
              setIsFinalized(true);
              return;
            }
            setIsIdentified(true);
          }
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar o link da Comissão Organizadora.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadPublicData();
  }, [loadPublicData]);

  const countdownInfo = useMemo(() => {
    if (!state?.deadline) return null;
    const deadlineMs = new Date(state.deadline).getTime();
    if (isNaN(deadlineMs)) return null;
    const diffMs = deadlineMs - nowTick;
    if (diffMs <= 0) {
      return { text: 'Prazo encerrado', isExpired: true, isUrgent: false };
    }
    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    const text =
      days > 0
        ? `Restam ${days}d ${pad(hours)}h ${pad(minutes)}m`
        : `Restam ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    return {
      text,
      isExpired: false,
      isUrgent: diffMs < 15 * 60 * 1000,
    };
  }, [state?.deadline, nowTick]);

  // Automatically transition to EXPIRED if deadline passes while page is open
  useEffect(() => {
    if (countdownInfo?.isExpired && state?.status === 'OPEN') {
      setState((prev) =>
        prev
          ? {
              ...prev,
              valid: false,
              status: 'EXPIRED',
              error: 'O prazo para envio de indicações da Comissão Organizadora já expirou.',
            }
          : prev
      );
    }
  }, [countdownInfo?.isExpired, state?.status]);

  const headerTitle = useMemo(() => {
    if (!state) return 'COMISSÃO ORGANIZADORA';
    const { baseName, congregation } = extractBaseMeetingName(
      state.meetingName,
      state.nominationCommissionName
    );
    const church = (congregation || baseName || state.meetingName || '').trim();
    if (!church || church.toUpperCase() === 'COMISSÃO ORGANIZADORA') {
      return 'COMISSÃO ORGANIZADORA';
    }
    return `COMISSÃO ORGANIZADORA — ${church.toUpperCase()}`;
  }, [state]);

  const handleAdvanceIdentification = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError(null);
    const cleanedName = (participantName || '').trim().replace(/\s+/g, ' ');
    if (!cleanedName) {
      setNameError('Por favor, informe seu nome para continuar.');
      return;
    }

    setIsStartingSession(true);
    try {
      const localSessId = sessionId || getOrCreateLocalOrganizingSessionId(token);
      setSessionId(localSessId);
      const sessResp = await startOrganizingParticipantSession(token, cleanedName, localSessId);
      const effectiveName = sessResp.nominatorName || cleanedName;
      const nameKey = getLocalParticipantNameKey(token);
      localStorage.setItem(nameKey, effectiveName);
      sessionStorage.setItem(nameKey, effectiveName);
      setParticipantName(effectiveName);

      if (sessResp.finalized) {
        setIsIdentified(true);
        setIsFinalized(true);
        return;
      }

      const initialDrafts: Record<string, string[]> = {};
      for (const crit of state?.criteria || []) {
        initialDrafts[crit.criterionId] = [''];
      }
      setDraftNominations(initialDrafts);
      setIsIdentified(true);
    } catch (err: unknown) {
      if ((err as any)?.status === 'ALREADY_SUBMITTED') {
        setIsIdentified(true);
        setIsFinalized(true);
        return;
      }
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível iniciar sua sessão de indicações.';
      setNameError(msg);
    } finally {
      setIsStartingSession(false);
    }
  };

  const handleDraftChange = (criterionId: string, idx: number, value: string) => {
    setDraftNominations((prev) => {
      const current = [...(prev[criterionId] || [''])];
      current[idx] = value;
      return { ...prev, [criterionId]: current };
    });
    setErrorMessage(null);
  };

  const handleAddField = (criterionId: string, maxLimit: number) => {
    setDraftNominations((prev) => {
      const current = prev[criterionId] || [];
      if (current.length >= maxLimit) return prev;
      return { ...prev, [criterionId]: [...current, ''] };
    });
  };

  const handleRemoveField = (criterionId: string, idx: number) => {
    setDraftNominations((prev) => {
      const current = prev[criterionId] || [];
      const next = current.filter((_, i) => i !== idx);
      return { ...prev, [criterionId]: next.length > 0 ? next : [''] };
    });
  };

  const handleFinalizeAll = async () => {
    if (!sessionId || !state) return;
    setErrorMessage(null);

    const cleanedParticipantName = (participantName || '').trim().replace(/\s+/g, ' ');
    if (!cleanedParticipantName) {
      setIsIdentified(false);
      setNameError('Informe seu nome antes de enviar suas indicações.');
      return;
    }

    const bulkMap: Record<string, string[]> = {};
    let totalNames = 0;

    for (const crit of state.criteria) {
      const rawList = draftNominations[crit.criterionId] || [];

      const seen = new Set<string>();
      const valid: string[] = [];
      for (const item of rawList) {
        const trimmed = (item || '').trim().replace(/\s+/g, ' ');
        if (!trimmed) continue;
        const norm = trimmed.toLowerCase();
        if (seen.has(norm)) {
          setErrorMessage(
            `O nome "${trimmed}" está duplicado no critério "${crit.name}".`
          );
          return;
        }
        seen.add(norm);
        valid.push(trimmed);
      }

      if (valid.length > crit.maxLimit) {
        setErrorMessage(
          `O critério "${crit.name}" permite no máximo ${crit.maxLimit} indicação(ões).`
        );
        return;
      }

      bulkMap[crit.criterionId] = valid;
      totalNames += valid.length;
    }

    if (totalNames === 0) {
      setErrorMessage('Informe pelo menos um nome indicado antes de enviar.');
      return;
    }

    setIsSubmittingAll(true);
    try {
      await saveParticipantOrganizingNominations(token, {
        sessionId,
        participantName: cleanedParticipantName,
        nominations: bulkMap,
        finalized: true,
      });
      await finalizeParticipantOrganizingNominations(token, {
        sessionId,
        nominatorName: cleanedParticipantName,
      });
      setIsFinalized(true);
    } catch (err: unknown) {
      if ((err as any)?.status === 'ALREADY_SUBMITTED') {
        setIsFinalized(true);
        return;
      }
      if ((err as any)?.status === 'EXPIRED') {
        loadPublicData();
        return;
      }
      const msg =
        err instanceof Error ? err.message : 'Erro ao enviar indicações.';
      setErrorMessage(msg);
    } finally {
      setIsSubmittingAll(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 max-w-md w-full text-center shadow-xs">
          <div className="w-8 h-8 border-3 border-[#111827] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-base font-bold text-[#111827]">
            Verificando link da Comissão Organizadora...
          </h2>
          <p className="text-xs text-[#6B7280] mt-1">Carregando dados da reunião.</p>
        </div>
      </div>
    );
  }

  if (isFinalized) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 sm:p-10 max-w-md w-full text-center shadow-xs space-y-6">
          <div className="flex items-center justify-center gap-2.5">
            <ChurchLogo className="w-10 h-10 text-[#111827]" />
            <span className="font-bold text-xl tracking-tight text-[#111827]">
              VOTAIASD
            </span>
          </div>

          <div className="w-14 h-14 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center mx-auto text-[#059669]">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#059669] bg-[#ECFDF5] px-3 py-1 rounded-full border border-[#A7F3D0]">
              INDICAÇÕES ENVIADAS
            </span>
            <h2 className="text-xl font-extrabold text-[#111827] pt-2">
              Indicações registradas com sucesso!
            </h2>
            <p className="text-xs text-[#6B7280] leading-relaxed">
              Obrigado por enviar suas indicações para a <strong>{headerTitle}</strong>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!state || !state.valid || state.status !== 'OPEN') {
    const status = state?.status || 'NOT_FOUND';
    let title = 'Link de Indicações Indisponível';
    let desc =
      state?.error ||
      errorMessage ||
      'Não foi possível acessar as indicações da Comissão Organizadora.';

    if (status === 'NOT_OPENED') {
      title = 'Indicações Ainda Não Abertas';
      desc =
        'O recebimento de indicações para a Comissão Organizadora ainda não foi aberto pelo administrador.';
    } else if (status === 'EXPIRED') {
      title = 'Prazo de Indicações Expirado';
      desc =
        'O prazo estipulado para envio de indicações da Comissão Organizadora já foi encerrado.';
    } else if (status === 'CLOSED') {
      title = 'Indicações Encerradas';
      desc =
        'O período de recebimento de indicações para a Comissão Organizadora está encerrado no momento.';
    } else if (status === 'NOT_FOUND') {
      title = 'Link Não Encontrado';
      desc =
        'O endereço acessado não corresponde a nenhuma reunião ou link ativo da Comissão Organizadora.';
    }

    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 max-w-md w-full text-center shadow-xs space-y-4">
          <div className="w-12 h-12 rounded-full bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center mx-auto text-[#DC2626]">
            <AlertCircle className="w-6 h-6" />
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#6B7280] block mb-1">
              {headerTitle}
            </span>
            <h2 className="text-lg font-bold text-[#111827]">{title}</h2>
            <p className="text-xs text-[#6B7280] mt-1.5 leading-relaxed">{desc}</p>
          </div>

          {state?.deadline && (
            <div className="text-[11px] text-[#6B7280] bg-[#F9FAFB] p-2.5 rounded-xl border border-[#E5E7EB]">
              Prazo limite registrado: <strong>{formatDeadline(state.deadline)}</strong>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ETAPA 1 — IDENTIFICAÇÃO DO PARTICIPANTE
  if (!isIdentified) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 sm:p-8 max-w-md w-full shadow-xs space-y-6">
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 mb-2">
              <ChurchLogo className="w-8 h-8 text-[#111827]" />
              <span className="font-bold text-base tracking-tight text-[#111827]">
                VOTAIASD
              </span>
            </div>

            <h1 className="text-lg sm:text-xl font-extrabold text-[#111827] uppercase">
              COMISSÃO ORGANIZADORA
            </h1>

            {headerTitle !== 'COMISSÃO ORGANIZADORA' && (
              <p className="text-xs font-bold text-[#374151] uppercase tracking-wider">
                {headerTitle.replace('COMISSÃO ORGANIZADORA — ', '')}
              </p>
            )}

            <p className="text-xs sm:text-sm text-[#6B7280] pt-1">
              Informe seu nome para iniciar suas indicações.
            </p>
          </div>

          {nameError && (
            <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-xl flex items-center gap-2 text-xs text-[#DC2626]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{nameError}</span>
            </div>
          )}

          <form onSubmit={handleAdvanceIdentification} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="input-organizing-participant-name"
                className="block text-xs font-bold text-[#374151]"
              >
                Seu nome
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="input-organizing-participant-name"
                  type="text"
                  required
                  autoFocus
                  maxLength={80}
                  placeholder="Digite seu primeiro nome"
                  value={participantName}
                  onChange={(e) => {
                    setParticipantName(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  className="w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl pl-10 pr-3.5 py-3 text-sm font-medium text-[#111827] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827]"
                />
              </div>
            </div>

            <button
              id="btn-advance-organizing-identification"
              type="submit"
              disabled={isStartingSession || !participantName.trim()}
              className="w-full py-3.5 bg-[#111827] hover:bg-black text-white text-xs sm:text-sm font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
            >
              <span>{isStartingSession ? 'Avançando...' : 'AVANÇAR'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ETAPA 2 — FORMULÁRIO DE INDICAÇÕES
  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5 pb-16">
      {/* Cabeçalho Público da Comissão Organizadora */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 sm:p-6 shadow-xs space-y-3 text-center">
        <span className="text-[11px] font-bold uppercase tracking-widest text-[#6B7280] bg-[#F3F4F6] px-3 py-1 rounded-full border border-[#E5E7EB]">
          INDICAÇÕES DE INTEGRANTES
        </span>

        <h1 className="text-lg sm:text-2xl font-extrabold text-[#111827]">
          {headerTitle}
        </h1>

        <p className="text-xs sm:text-sm text-[#6B7280] max-w-lg mx-auto leading-relaxed">
          Indique os nomes para compor a comissão de nomeações, respeitando os critérios e limites estabelecidos.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <div className="inline-flex items-center gap-1.5 text-xs text-[#374151] bg-[#F9FAFB] px-3 py-1.5 rounded-xl border border-[#E5E7EB]">
            <User className="w-3.5 h-3.5 text-[#6B7280]" />
            <span>
              Participante: <strong>{participantName}</strong>
            </span>
          </div>

          {state.deadline && (
            <div className="inline-flex flex-wrap items-center justify-center gap-2 text-xs text-[#6B7280] bg-[#F9FAFB] px-3.5 py-1.5 rounded-xl border border-[#E5E7EB]">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#111827]" />
                <span>
                  Prazo limite: <strong>{formatDeadline(state.deadline)}</strong>
                </span>
              </div>
              {countdownInfo && (
                <span
                  className={`font-mono font-bold text-[11px] px-2 py-0.5 rounded-lg border ${
                    countdownInfo.isExpired
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : countdownInfo.isUrgent
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : 'bg-white text-[#111827] border-[#D1D5DB]'
                  }`}
                >
                  {countdownInfo.text}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 bg-[#FEF2F2] border border-[#FECACA] rounded-xl flex items-center gap-2.5 text-xs text-[#DC2626]">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Lista de Critérios Ativos (HOMENS, MULHERES, JOVENS, etc.) */}
      <div className="space-y-4">
        {state.criteria.map((crit, idx) => {
          const drafts = draftNominations[crit.criterionId] || [''];

          return (
            <div
              key={crit.criterionId}
              className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#F3F4F6] pb-3 gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold font-mono text-[#9CA3AF]">
                    {idx + 1}.
                  </span>
                  <h2 className="text-sm sm:text-base font-extrabold text-[#111827]">
                    {crit.name}
                  </h2>
                </div>

                <span className="text-[11px] font-bold text-[#374151] bg-[#F3F4F6] px-2.5 py-1 rounded-full border border-[#E5E7EB]">
                  Até {crit.maxLimit} {crit.maxLimit === 1 ? 'indicação' : 'indicações'}
                </span>
              </div>

              <div className="space-y-3">
                {drafts.map((val, fieldIdx) => (
                  <div key={fieldIdx} className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[#9CA3AF] w-5 text-right">
                      {fieldIdx + 1}.
                    </span>
                    <input
                      type="text"
                      placeholder={`Nome indicado para ${crit.name}`}
                      value={val}
                      maxLength={100}
                      onChange={(e) =>
                        handleDraftChange(crit.criterionId, fieldIdx, e.target.value)
                      }
                      className="flex-1 bg-[#F9FAFB] border border-[#D1D5DB] rounded-xl px-3.5 py-2.5 text-sm font-medium text-[#111827] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#111827]"
                    />
                    {drafts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveField(crit.criterionId, fieldIdx)}
                        className="p-2 text-[#9CA3AF] hover:text-[#DC2626] rounded-lg cursor-pointer"
                        title="Remover campo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {drafts.length < crit.maxLimit ? (
                    <button
                      type="button"
                      onClick={() => handleAddField(crit.criterionId, crit.maxLimit)}
                      className="px-3 py-1.5 bg-[#F9FAFB] hover:bg-[#F3F4F6] text-[#111827] border border-[#D1D5DB] rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>
                        Adicionar outro nome ({drafts.length}/{crit.maxLimit})
                      </span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-[#6B7280]">
                      Limite de {crit.maxLimit}{' '}
                      {crit.maxLimit === 1 ? 'campo atingido' : 'campos atingido'}.
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Botão Final de Envio Geral */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-xs">
        <button
          id="btn-submit-organizing-nominations"
          type="button"
          disabled={isSubmittingAll}
          onClick={handleFinalizeAll}
          className="w-full py-3.5 bg-[#059669] hover:bg-[#047857] text-white text-xs sm:text-sm font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          <span>{isSubmittingAll ? 'Enviando Indicações...' : 'CONCLUIR E ENVIAR INDICAÇÕES'}</span>
        </button>
      </div>
    </div>
  );
};
