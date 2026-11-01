import React, { useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Trash2,
  Eye,
  RefreshCw,
  RotateCw,
  Archive,
  Layers,
  Clock,
} from 'lucide-react';
import { HistoryYearGroup } from '../types';
import { formatMeetingTitle } from '../utils/meetingTitle';

interface MeetingHistoryViewProps {
  history: HistoryYearGroup[];
  isLoading: boolean;
  onRefresh: () => void;
  onViewMeeting: (code: string) => void;
  onDeleteMeeting: (code: string, name: string) => void;
  onDeleteMonth: (year: number, month: number, monthName: string, count: number) => void;
  onDeleteYear: (year: number, count: number) => void;
}

export const MeetingHistoryView: React.FC<MeetingHistoryViewProps> = ({
  history,
  isLoading,
  onRefresh,
  onViewMeeting,
  onDeleteMeeting,
  onDeleteMonth,
  onDeleteYear,
}) => {
  // State for collapsible years: defaults to all expanded
  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>({});
  // State for collapsible months: key format `${year}-${month}`
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  const toggleYear = (year: number) => {
    setExpandedYears((prev) => ({
      ...prev,
      [year]: prev[year] === undefined ? false : !prev[year],
    }));
  };

  const isYearExpanded = (year: number) => {
    // default to expanded (true) if undefined
    return expandedYears[year] !== false;
  };

  const toggleMonth = (year: number, month: number) => {
    const key = `${year}-${month}`;
    setExpandedMonths((prev) => ({
      ...prev,
      [key]: prev[key] === undefined ? false : !prev[key],
    }));
  };

  const isMonthExpanded = (year: number, month: number) => {
    const key = `${year}-${month}`;
    // default to expanded (true) if undefined
    return expandedMonths[key] !== false;
  };

  const totalClosedMeetings = history.reduce((acc, y) => acc + y.totalMeetings, 0);

  return (
    <section id="section-meeting-history" className="space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-[#111827]" />
            <h2 className="text-lg font-bold text-[#111827] tracking-tight">
              Histórico de Reuniões
            </h2>
            {totalClosedMeetings > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB]">
                {totalClosedMeetings} {totalClosedMeetings === 1 ? 'encerrada' : 'encerradas'}
              </span>
            )}
          </div>
          <p className="text-xs text-[#6B7280] mt-1">
            Reuniões finalizadas organizadas por ano e mês. Os dados e resultados permanecem arquivados até exclusão explícita.
          </p>
        </div>

        <button
          id="btn-history-refresh"
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#374151] hover:text-[#111827] border border-[#E5E7EB] rounded-xl transition-all cursor-pointer shadow-2xs shrink-0 disabled:opacity-50"
          title="Atualizar histórico"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Loading state */}
      {isLoading && history.length === 0 && (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center shadow-xs">
          <RefreshCw className="w-6 h-6 animate-spin text-[#9CA3AF] mx-auto mb-3" />
          <p className="text-xs text-[#6B7280]">Carregando histórico de reuniões...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && history.length === 0 && (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-[#F3F4F6] border border-[#E5E7EB] text-[#9CA3AF] flex items-center justify-center mx-auto mb-3">
            <Archive className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-[#111827]">
            Nenhuma reunião encerrada no histórico
          </h3>
          <p className="text-xs text-[#6B7280] mt-1 max-w-sm mx-auto">
            Quando você encerrar uma reunião no painel principal, ela será automaticamente arquivada e organizada por ano e mês nesta seção.
          </p>
        </div>
      )}

      {/* Years List */}
      {history.length > 0 && (
        <div className="space-y-5">
          {history.map((yearGroup) => {
            const yearExpanded = isYearExpanded(yearGroup.year);

            return (
              <div
                key={yearGroup.year}
                id={`history-year-${yearGroup.year}`}
                className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden transition-all"
              >
                {/* Year Header */}
                <div className="p-4 sm:p-5 flex items-center justify-between gap-3 bg-[#F9FAFB] border-b border-[#E5E7EB]">
                  <button
                    id={`btn-toggle-year-${yearGroup.year}`}
                    type="button"
                    onClick={() => toggleYear(yearGroup.year)}
                    className="flex items-center gap-2.5 text-left font-bold text-base text-[#111827] hover:text-black transition-colors cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-lg bg-white border border-[#E5E7EB] flex items-center justify-center text-[#6B7280]">
                      {yearExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </div>
                    <span className="tracking-tight">{yearGroup.year}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white border border-[#E5E7EB] text-[#4B5563]">
                      {yearGroup.totalMeetings} {yearGroup.totalMeetings === 1 ? 'reunião' : 'reuniões'}
                    </span>
                  </button>

                  <button
                    id={`btn-delete-year-${yearGroup.year}`}
                    type="button"
                    onClick={() => onDeleteYear(yearGroup.year, yearGroup.totalMeetings)}
                    title={`Excluir todo o ano ${yearGroup.year}`}
                    className="px-3 py-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Excluir ano</span>
                  </button>
                </div>

                {/* Year Months Content */}
                {yearExpanded && (
                  <div className="p-4 sm:p-5 space-y-4">
                    {yearGroup.months.map((monthGroup) => {
                      const monthExpanded = isMonthExpanded(yearGroup.year, monthGroup.month);
                      const monthKey = `${yearGroup.year}-${monthGroup.month}`;

                      return (
                        <div
                          key={monthKey}
                          id={`history-month-${monthKey}`}
                          className="bg-[#FAFAFA] rounded-xl border border-[#E5E7EB] overflow-hidden"
                        >
                          {/* Month Header */}
                          <div className="p-3 sm:p-4 flex items-center justify-between gap-3 bg-white border-b border-[#E5E7EB]">
                            <button
                              id={`btn-toggle-month-${monthKey}`}
                              type="button"
                              onClick={() => toggleMonth(yearGroup.year, monthGroup.month)}
                              className="flex items-center gap-2 text-left text-sm font-bold text-[#111827] hover:text-black transition-colors cursor-pointer"
                            >
                              <div className="w-5 h-5 rounded-md bg-[#F3F4F6] border border-[#E5E7EB] flex items-center justify-center text-[#6B7280]">
                                {monthExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                              </div>
                              <span>{monthGroup.monthName}</span>
                              <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-[#F3F4F6] text-[#4B5563]">
                                {monthGroup.meetings.length} {monthGroup.meetings.length === 1 ? 'reunião' : 'reuniões'}
                              </span>
                            </button>

                            <button
                              id={`btn-delete-month-${monthKey}`}
                              type="button"
                              onClick={() =>
                                onDeleteMonth(
                                  yearGroup.year,
                                  monthGroup.month,
                                  monthGroup.monthName,
                                  monthGroup.meetings.length
                                )
                              }
                              title={`Excluir mês de ${monthGroup.monthName} de ${yearGroup.year}`}
                              className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Excluir mês</span>
                            </button>
                          </div>

                          {/* Month Meetings List */}
                          {monthExpanded && (
                            <div className="divide-y divide-[#E5E7EB]">
                              {monthGroup.meetings.map((m) => {
                                const created = new Date(m.createdAt);
                                const dateFormatted = created.toLocaleDateString('pt-BR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                });
                                const timeFormatted = created.toLocaleTimeString('pt-BR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                });

                                return (
                                  <div
                                    key={m.id}
                                    id={`history-meeting-${m.code}`}
                                    className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white transition-colors"
                                  >
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-sm text-[#111827]">
                                          {m.name}
                                        </span>
                                        {m.nominationCommissionName && (
                                          <span className="text-xs font-semibold text-[#1E3A8A] bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                            {m.nominationCommissionName}
                                          </span>
                                        )}
                                        <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-white border border-[#E5E7EB] text-[#111827]">
                                          {m.code}
                                        </span>
                                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                                          Encerrada
                                        </span>
                                      </div>
                                      {m.nominationCommissionName && (
                                        <p className="text-xs text-[#4B5563] font-medium">
                                          Congregação: <strong className="text-[#111827]">{m.nominationCommissionName}</strong>
                                        </p>
                                      )}

                                      <div className="flex items-center gap-3 text-xs text-[#6B7280] flex-wrap">
                                        <span className="flex items-center gap-1">
                                          <Calendar className="w-3.5 h-3.5" />
                                          {dateFormatted} às {timeFormatted}
                                        </span>
                                        <span>•</span>
                                        <span className="flex items-center gap-1">
                                          <Layers className="w-3.5 h-3.5" />
                                          {m.totalPolls} {m.totalPolls === 1 ? 'pauta' : 'pautas'}
                                        </span>
                                        <span>•</span>
                                        <span>{m.totalVotes} votos computados</span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                      <button
                                        id={`btn-view-meeting-${m.code}`}
                                        type="button"
                                        onClick={() => onViewMeeting(m.code)}
                                        className="px-3 py-1.5 bg-white hover:bg-[#F3F4F6] border border-[#E5E7EB] text-[#111827] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                                      >
                                        <Eye className="w-3.5 h-3.5 text-[#6B7280]" />
                                        <span>Visualizar</span>
                                      </button>

                                      <button
                                        id={`btn-delete-meeting-${m.code}`}
                                        type="button"
                                        onClick={() => onDeleteMeeting(m.code, m.name)}
                                        className="p-1.5 sm:px-3 sm:py-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                                        title={`Excluir reunião ${m.name}`}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline">Excluir</span>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
