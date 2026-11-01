import React, { useEffect, useState } from 'react';
import {
  X,
  Printer,
  Calendar,
  Clock,
  AlertTriangle,
  RefreshCw,
  Maximize2,
  Users,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { AdminMeetingState, PollResult } from '../types';
import { formatMeetingTitle } from '../utils/meetingTitle';
import { fetchAdminMeeting, getMeetingReportUrl } from '../services/api';
import { ProjectionResultModal } from './ProjectionResultModal';
import { AtaModal } from './AtaModal';
import { canDepartmentHaveAssociates } from '../constants/departments';

interface HistoryMeetingDetailModalProps {
  isOpen: boolean;
  meetingCode: string | null;
  onClose: () => void;
}

export const HistoryMeetingDetailModal: React.FC<HistoryMeetingDetailModalProps> = ({
  isOpen,
  meetingCode,
  onClose,
}) => {
  const [meetingState, setMeetingState] = useState<AdminMeetingState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectingPoll, setProjectingPoll] = useState<PollResult | null>(null);
  const [isAtaOpen, setIsAtaOpen] = useState(false);

  useEffect(() => {
    if (isOpen && meetingCode) {
      loadDetails(meetingCode);
    } else {
      setMeetingState(null);
      setError(null);
    }
  }, [isOpen, meetingCode]);

  const loadDetails = async (code: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAdminMeeting(code);
      setMeetingState(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar reunião do histórico.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrintReport = () => {
    if (!meetingCode) return;
    const url = getMeetingReportUrl(meetingCode);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const meeting = meetingState?.meeting;
  const historyPolls = meetingState?.history || [];

  const lastClosedPollId = React.useMemo(() => {
    if (!historyPolls || historyPolls.length === 0) return null;
    const closed = historyPolls.filter((p) => p.status === 'POLL_CLOSED' || Boolean(p.closedAt));
    if (closed.length === 0) return null;
    const sorted = [...closed].sort((a, b) => {
      const timeA = new Date(a.closedAt || a.openedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.closedAt || b.openedAt || b.createdAt || 0).getTime();
      if (timeB !== timeA) return timeB - timeA;
      return (b.pollId || '').localeCompare(a.pollId || '');
    });
    return sorted[0].pollId;
  }, [historyPolls]);

  if (!isOpen) return null;

  const createdDate = meeting ? new Date(meeting.createdAt) : null;
  const closedDate = meeting?.closedAt ? new Date(meeting.closedAt) : null;

  const formattedDate = createdDate
    ? createdDate.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '';

  const formattedTime = createdDate
    ? createdDate.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const formattedClosedTime = closedDate
    ? closedDate.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const totalVotesAcrossMeeting = historyPolls.reduce(
    (acc, p) => acc + (p.totalSelections ?? p.totalVotes),
    0
  );

  return (
    <div
      id="modal-history-meeting-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
    >
      <div
        id="modal-history-meeting-content"
        className="bg-white w-full max-w-3xl rounded-2xl border border-[#E5E7EB] shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-5 border-b border-[#E5E7EB] flex items-start justify-between gap-4 bg-[#F9FAFB]">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#6B7280]">
                Reunião Encerrada
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                Encerrada
              </span>
              {meetingCode && (
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-white border border-[#E5E7EB] text-[#111827]">
                  {meetingCode}
                </span>
              )}
            </div>

            <h2 className="text-xl font-bold text-[#111827] tracking-tight">
              {meeting ? formatMeetingTitle(meeting.name, meeting.nominationCommissionName) : 'Carregando detalhes...'}
            </h2>

            {meeting?.description && (
              <p className="text-xs text-[#6B7280]">{meeting.description}</p>
            )}

            {formattedDate && (
              <div className="flex items-center gap-4 text-xs text-[#6B7280] pt-1 flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {formattedDate}
                </span>
                {formattedTime && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Início: {formattedTime}
                    {formattedClosedTime && ` • Término: ${formattedClosedTime}`}
                  </span>
                )}
              </div>
            )}
          </div>

          <button
            id="btn-close-history-details"
            type="button"
            onClick={onClose}
            className="text-[#9CA3AF] hover:text-[#111827] p-2 rounded-xl hover:bg-white border border-transparent hover:border-[#E5E7EB] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="px-5 py-3 border-b border-[#E5E7EB] bg-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-xs text-[#6B7280]">
            <span>
              <strong className="text-[#111827]">{historyPolls.length}</strong> {historyPolls.length === 1 ? 'pauta realizada' : 'pautas realizadas'}
            </span>
            <span>•</span>
            <span>
              <strong className="text-[#111827]">{totalVotesAcrossMeeting}</strong> votos computados
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-history-view-ata"
              type="button"
              disabled={isLoading || !meetingState}
              onClick={() => setIsAtaOpen(true)}
              className="px-3 py-1.5 bg-white hover:bg-[#F3F4F6] border border-[#E5E7EB] rounded-xl text-xs font-bold text-[#374151] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Visualizar Ata da Comissão de Nomeações desta reunião"
            >
              <FileText className="w-3.5 h-3.5 text-[#6B7280]" />
              <span>Ata</span>
            </button>

            <button
              id="btn-history-print-report"
              type="button"
              disabled={isLoading || !meetingState}
              onClick={handlePrintReport}
              className="px-3 py-1.5 bg-[#111827] hover:bg-black text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Relatório</span>
            </button>
          </div>
        </div>

        {/* Body content */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 bg-[#F9FAFB]">
          {isLoading && (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-[#9CA3AF]">
              <RefreshCw className="w-6 h-6 animate-spin" />
              <span className="text-xs">Carregando dados da reunião...</span>
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isLoading && !error && historyPolls.length === 0 && (
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center text-[#6B7280]">
              <p className="text-sm font-medium">Nenhuma pauta foi realizada nesta reunião.</p>
            </div>
          )}

          {!isLoading && !error && historyPolls.length > 0 && (
            <div className="space-y-4">
              {historyPolls.map((poll, idx) => {
                const isLastClosed = poll.pollId === lastClosedPollId;
                return (
                <div
                  key={poll.pollId || idx}
                  className={`p-5 rounded-2xl space-y-4 transition-colors ${
                    isLastClosed
                      ? 'bg-[#F8FAFC] border-2 border-[#111827] shadow-xs'
                      : 'bg-white border border-[#E5E7EB] shadow-xs'
                  }`}
                >
                  {/* Poll Title & Metadata */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-[#F3F4F6] pb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF]">
                          Pauta {String(idx + 1).padStart(2, '0')}
                        </span>
                        {isLastClosed && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#111827] text-white shadow-2xs">
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                            <span>ÚLTIMA PAUTA VOTADA</span>
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB]">
                          {poll.allowMultiple
                            ? `Múltipla Escolha (até ${poll.maxChoices || 2} escolhas)`
                            : 'Escolha Única'}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-[#111827] leading-snug break-words">
                        {poll.question}
                      </h3>
                    </div>

                    <div className="text-left sm:text-right shrink-0 flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[#111827]">
                        {poll.allowMultiple
                          ? `${poll.totalVoters ?? poll.totalVotes} participantes • ${poll.totalSelections ?? poll.totalVotes} escolhas`
                          : `${poll.totalVotes} ${poll.totalVotes === 1 ? 'voto' : 'votos'}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setProjectingPoll(poll)}
                        className="px-2.5 py-1 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-[11px] font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                        title="Projetar resultado desta pauta"
                      >
                        <Maximize2 className="w-3 h-3 text-[#4B5563]" />
                        <span>PROJETAR</span>
                      </button>
                    </div>
                  </div>

                  {/* Options Results Breakdown */}
                  <div className="space-y-2.5">
                    {poll.options
                      .map((opt, idx) => ({ opt, idx }))
                      .sort((a, b) => {
                        if (b.opt.percentage !== a.opt.percentage) return b.opt.percentage - a.opt.percentage;
                        if (b.opt.votes !== a.opt.votes) return b.opt.votes - a.opt.votes;
                        return a.idx - b.idx;
                      })
                      .map(({ opt }) => {
                      const isAboveHalf = opt.percentage > 50;

                      return (
                        <div
                          key={opt.optionId}
                          className="p-3 rounded-xl border border-[#E5E7EB] bg-white transition-all space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs gap-2">
                            <span className="font-medium text-[#111827]">
                              {opt.text}
                            </span>
                            <div className="flex items-center gap-2 font-mono">
                              <span className="font-bold text-[#111827]">
                                {opt.votes} {opt.votes === 1 ? 'voto' : 'votos'}
                              </span>
                              <span className="text-[#111827]">
                                (
                                <span
                                  className={
                                    opt.percentage > 50
                                      ? 'text-emerald-600 font-bold'
                                      : opt.percentage > 25
                                      ? 'text-amber-600 font-bold'
                                      : 'text-rose-600 font-bold'
                                  }
                                >
                                  {opt.percentage}%
                                </span>
                                )
                              </span>
                            </div>
                          </div>

                          {/* Progress Bar */}
                          <div className="h-2 w-full bg-[#F3F4F6] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#111827] transition-all duration-300 rounded-full"
                              style={{ width: `${Math.min(opt.percentage, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Associados display */}
                  {canDepartmentHaveAssociates(poll.sourceDepartmentId || poll.question) && (() => {
                    const direct = poll.associates || [];
                    const voted = (poll.votedAssociates || []).map((va) => va.winnerName);
                    const seen = new Set<string>();
                    const unifiedAssociates: string[] = [];
                    for (const name of [...direct, ...voted]) {
                      if (!name || typeof name !== 'string') continue;
                      const clean = name.trim();
                      const lower = clean.toLowerCase();
                      if (clean.length > 0 && !seen.has(lower)) {
                        seen.add(lower);
                        unifiedAssociates.push(clean);
                      }
                    }
                    if (unifiedAssociates.length === 0) return null;
                    return (
                      <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2 flex items-start gap-2 text-xs">
                        <Users className="w-3.5 h-3.5 text-[#4B5563] shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-[#111827]">ASSOCIADOS: </span>
                          <span className="text-[#374151] font-medium">{unifiedAssociates.join(', ')}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Poll Timestamps Footer */}
                  {(poll.openedAt || poll.closedAt) && (
                    <div className="pt-2 text-[10px] text-[#9CA3AF] flex flex-wrap items-center gap-3">
                      {poll.openedAt && (
                        <span>
                          Aberta em: {new Date(poll.openedAt).toLocaleString('pt-BR')}
                        </span>
                      )}
                      {poll.closedAt && (
                        <span>
                          Encerrada em: {new Date(poll.closedAt).toLocaleString('pt-BR')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#E5E7EB] bg-white flex items-center justify-between text-xs text-[#9CA3AF]">
          <span>Anonimato 100% preservado • Sem dados pessoais</span>
          <button
            id="btn-history-detail-close-bottom"
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#374151] bg-[#F3F4F6] hover:bg-[#E5E7EB] rounded-xl transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Projection Result Modal */}
      <ProjectionResultModal
        isOpen={Boolean(projectingPoll)}
        onClose={() => setProjectingPoll(null)}
        poll={null}
        pollResult={projectingPoll}
        meetingName={meeting?.name}
      />

      {/* Ata da Comissão de Nomeações Modal */}
      <AtaModal
        isOpen={isAtaOpen}
        onClose={() => setIsAtaOpen(false)}
        meetingCode={meetingCode}
      />
    </div>
  );
};
