import React, { useEffect, useState } from 'react';
import { Maximize2, Minimize2, X, Users } from 'lucide-react';
import { Poll, PollResult } from '../types';
import { canDepartmentHaveAssociates } from '../constants/departments';

interface ProjectionResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  poll: Poll | null;
  pollResult: PollResult | null;
  meetingName?: string;
  initialFullscreen?: boolean;
  confirmedWinnerNames?: string[];
  candidatesKept?: string[];
  candidatesRemoved?: string[];
  cutoffPercentage?: number;
}

export const ProjectionResultModal: React.FC<ProjectionResultModalProps> = ({
  isOpen,
  onClose,
  poll,
  pollResult,
  meetingName,
  initialFullscreen = false,
  confirmedWinnerNames: propConfirmedWinnerNames,
  candidatesKept: propCandidatesKept,
  candidatesRemoved: propCandidatesRemoved,
  cutoffPercentage,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(initialFullscreen);

  useEffect(() => {
    if (isOpen) {
      setIsFullscreen(initialFullscreen);
    }
  }, [isOpen, initialFullscreen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
      if (e.key === 'f' || e.key === 'F') {
        setIsFullscreen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFullscreen, onClose]);

  if (!isOpen || (!poll && !pollResult)) return null;

  const question = pollResult?.question || poll?.question || '';
  const isClosed = pollResult?.status === 'CLOSED' || poll?.status === 'CLOSED';
  const isOpenPoll = poll?.status === 'OPEN' || pollResult?.status === 'OPEN';

  // Build list of options with percentages only (public projection never contains vote counts)
  interface DisplayOption {
    id: string;
    text: string;
    percentage: number;
  }

  let displayOptions: DisplayOption[] = [];

  if (pollResult && pollResult.options && pollResult.options.length > 0) {
    displayOptions = pollResult.options
      .map((opt, idx) => ({
        id: opt.optionId || (opt as any).id,
        text: opt.text,
        percentage: Number(opt.percentage) || 0,
        votes: typeof opt.votes === 'number' ? opt.votes : 0,
        _origIdx: idx,
      }))
      .sort((a, b) => {
        if (b.percentage !== a.percentage) return b.percentage - a.percentage;
        if (b.votes !== a.votes) return b.votes - a.votes;
        return a._origIdx - b._origIdx;
      })
      .map(({ id, text, percentage }) => ({ id, text, percentage }));
  } else if (poll && poll.options) {
    displayOptions = poll.options.map((opt) => ({
      id: opt.id,
      text: opt.text,
      percentage: 0,
    }));
  }

  // Consolidate administrative candidate statuses for color coding:
  // GREEN (emerald): Confirmed definitive winner/status
  // RED (rose): Confirmed removed from next round
  // ORANGE (amber): In dispute / kept / default active option
  const confirmedSet = new Set<string>();
  const removedSet = new Set<string>();
  const keptSet = new Set<string>();

  const addNames = (set: Set<string>, list: any) => {
    if (Array.isArray(list)) {
      list.forEach((item) => {
        if (typeof item === 'string' && item.trim()) {
          set.add(item.trim().toLowerCase());
        }
      });
    }
  };

  addNames(confirmedSet, propConfirmedWinnerNames);
  addNames(confirmedSet, pollResult?.confirmedWinnerNames);
  addNames(confirmedSet, poll?.confirmedWinnerNames);
  addNames(confirmedSet, pollResult?.decisionAudit?.confirmedWinnersThisRound);
  addNames(confirmedSet, poll?.decisionAudit?.confirmedWinnersThisRound);

  addNames(removedSet, propCandidatesRemoved);
  addNames(removedSet, pollResult?.decisionAudit?.candidatesRemovedByAdmin);
  addNames(removedSet, poll?.decisionAudit?.candidatesRemovedByAdmin);
  addNames(removedSet, (pollResult as any)?.candidatesRemovedByAdmin);
  addNames(removedSet, (poll as any)?.candidatesRemovedByAdmin);
  addNames(removedSet, (pollResult as any)?.candidatesRemoved);
  addNames(removedSet, (poll as any)?.candidatesRemoved);

  addNames(keptSet, propCandidatesKept);
  addNames(keptSet, pollResult?.decisionAudit?.candidatesKeptByAdmin);
  addNames(keptSet, poll?.decisionAudit?.candidatesKeptByAdmin);
  addNames(keptSet, (pollResult as any)?.candidatesKeptByAdmin);
  addNames(keptSet, (poll as any)?.candidatesKeptByAdmin);
  addNames(keptSet, (pollResult as any)?.candidatesKept);
  addNames(keptSet, (poll as any)?.candidatesKept);

  // Consolidate associates
  const allowsAssociates = canDepartmentHaveAssociates(
    pollResult?.sourceDepartmentId || pollResult?.question || poll?.sourceDepartmentId || poll?.question
  );

  const unifiedAssociates: string[] = (() => {
    if (!allowsAssociates) return [];
    const direct = pollResult?.associates || poll?.associates || [];
    const voted = (pollResult?.votedAssociates || poll?.votedAssociates || []).map((va) => va.winnerName);
    const seen = new Set<string>();
    const list: string[] = [];
    for (const name of [...direct, ...voted]) {
      if (!name || typeof name !== 'string') continue;
      const clean = name.trim();
      const lower = clean.toLowerCase();
      if (clean.length > 0 && !seen.has(lower)) {
        seen.add(lower);
        list.push(clean);
      }
    }
    return list;
  })();

  return (
    <div
      id="projection-result-overlay"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in select-none"
      onClick={() => {
        if (!isFullscreen) onClose();
      }}
    >
      <div
        id="projection-result-card"
        className={`bg-[#0F172A] text-white shadow-2xl transition-all ${
          isFullscreen
            ? 'fixed inset-0 z-50 flex flex-col justify-between w-screen h-screen p-6 sm:p-12 overflow-y-auto'
            : 'w-full max-w-xl sm:max-w-2xl rounded-2xl border border-slate-700/60 p-5 sm:p-7 flex flex-col max-h-[92vh] overflow-y-auto my-auto'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Title and Controls */}
        <header className="w-full flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="min-w-0 pr-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight uppercase">
              Resultado da Votação
            </h2>
            {meetingName && (
              <p className="text-xs text-slate-400 font-medium truncate mt-0.5 max-w-xs sm:max-w-md">
                {meetingName}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              id="btn-projection-toggle-fullscreen"
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Restaurar tamanho' : 'Tela cheia (tecla F)'}
              className="px-2.5 py-1.5 sm:px-3 text-xs font-bold uppercase tracking-wider text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer border border-slate-700 shadow-2xs"
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Restaurar</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Tela Cheia</span>
                </>
              )}
            </button>

            <button
              id="btn-projection-close"
              type="button"
              onClick={onClose}
              title="Fechar (Esc)"
              className="p-1.5 text-slate-400 hover:text-[#EF4444] hover:bg-slate-800 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Main Content: Question + Options + Associates */}
        <main
          className={`flex-1 flex flex-col justify-center my-auto ${
            isFullscreen ? 'max-w-5xl mx-auto w-full py-8 sm:py-12 space-y-8' : 'py-6 space-y-6'
          }`}
        >
          {/* Question Title */}
          <div className="border-b border-slate-800/80 pb-4 sm:pb-6">
            <h1
              className={`font-black text-white tracking-tight uppercase leading-tight ${
                isFullscreen ? 'text-2xl sm:text-4xl md:text-5xl' : 'text-lg sm:text-2xl'
              }`}
            >
              {question}
            </h1>
          </div>

          {/* Options Breakdown */}
          <div className={isFullscreen ? 'space-y-6 sm:space-y-8' : 'space-y-4'}>
            {displayOptions.map((opt) => {
              const lowerText = opt.text.trim().toLowerCase();

              const isConfirmed = confirmedSet.has(lowerText);
              const isRemoved = removedSet.has(lowerText);

              let colorTheme: 'emerald' | 'amber' | 'rose' = 'amber';

              if (isConfirmed) {
                // VERDE: candidato com situação definitiva confirmada pelo administrador
                colorTheme = 'emerald';
              } else if (isRemoved) {
                // VERMELHO: candidato marcado pelo administrador para retirada da próxima rodada
                colorTheme = 'rose';
              } else if (opt.percentage > 50) {
                // VERDE: percentual estritamente superior a 50%
                colorTheme = 'emerald';
              } else if (opt.percentage > 25) {
                // LARANJA: percentual superior a 25% e igual ou inferior a 50%
                colorTheme = 'amber';
              } else {
                // VERMELHO: percentual igual ou inferior a 25%
                colorTheme = 'rose';
              }

              const textColorClass =
                colorTheme === 'emerald'
                  ? 'text-emerald-400 font-bold'
                  : colorTheme === 'rose'
                  ? 'text-rose-400 font-bold'
                  : 'text-amber-400 font-bold';

              const barBgClass =
                colorTheme === 'emerald'
                  ? 'bg-emerald-500'
                  : colorTheme === 'rose'
                  ? 'bg-rose-500'
                  : 'bg-amber-500';

              return (
                <div key={opt.id} className="space-y-2">
                  {/* Option Name and Percentage */}
                  <div className="flex items-baseline justify-between gap-4">
                    <span
                      className={`font-extrabold uppercase tracking-wide text-slate-100 truncate ${
                        isFullscreen ? 'text-xl sm:text-2xl md:text-3xl' : 'text-sm sm:text-base'
                      }`}
                    >
                      {opt.text}
                    </span>
                    <span
                      className={`font-mono font-black tracking-tight shrink-0 ${textColorClass} ${
                        isFullscreen ? 'text-2xl sm:text-4xl md:text-5xl' : 'text-lg sm:text-2xl'
                      }`}
                    >
                      {opt.percentage}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div
                    className={`w-full bg-slate-800/90 rounded-full overflow-hidden border border-slate-700/40 ${
                      isFullscreen ? 'h-3.5 sm:h-5' : 'h-3 sm:h-3.5'
                    }`}
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-out ${barBgClass}`}
                      style={{ width: `${Math.min(opt.percentage, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Associados Box */}
          {unifiedAssociates.length > 0 && (
            <div
              className={`bg-slate-800/80 border border-slate-700/60 rounded-2xl flex items-center gap-3 ${
                isFullscreen ? 'mt-8 p-4 sm:p-5' : 'mt-4 p-3 sm:p-4'
              }`}
            >
              <Users className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-xs uppercase font-bold tracking-widest text-emerald-400 mr-2">
                  Associados:
                </span>
                <span
                  className={`font-bold text-slate-100 ${
                    isFullscreen ? 'text-base sm:text-lg' : 'text-xs sm:text-sm'
                  }`}
                >
                  {unifiedAssociates.join(', ')}
                </span>
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="w-full pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 font-medium">
          <div className="flex items-center gap-2">
            {isOpenPoll ? (
              <>
                <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse" />
                <span className="uppercase tracking-widest text-[11px] font-bold text-slate-300">
                  Resultado em tempo real
                </span>
              </>
            ) : isClosed ? (
              <span className="uppercase tracking-widest text-[11px] font-bold text-slate-400">
                Resultado final
              </span>
            ) : null}
          </div>

          <span className="text-[11px] text-slate-500 font-mono tracking-wider">
            {isFullscreen ? 'Pressione ESC para restaurar' : 'Pressione ESC para fechar'}
          </span>
        </footer>
      </div>
    </div>
  );
};
