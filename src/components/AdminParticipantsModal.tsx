import React from 'react';
import { X, Users, RotateCw } from 'lucide-react';

interface AdminParticipantsModalProps {
  isOpen: boolean;
  onClose: () => void;
  participants: string[];
  count: number;
  meetingCode?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
  isEmbedded?: boolean;
}

export const AdminParticipantsModal: React.FC<AdminParticipantsModalProps> = ({
  isOpen,
  onClose,
  participants,
  count,
  onRefresh,
  isLoading = false,
  isEmbedded = false,
}) => {
  if (!isOpen && !isEmbedded) return null;

  const content = (
    <div className={`bg-white rounded-2xl border border-[#E5E7EB] ${isEmbedded ? 'shadow-xs max-w-2xl mx-auto' : 'shadow-xl w-full max-w-sm max-h-[85vh]'} overflow-hidden flex flex-col`}>
      {/* Header */}
      <div className="p-5 border-b border-[#E5E7EB] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#F3F4F6] border border-[#E5E7EB] flex items-center justify-center text-[#111827]">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#111827] uppercase tracking-wider">
              Participantes Online
            </h2>
            <p className="text-xs text-[#6B7280]">
              {count} {count === 1 ? 'conectado' : 'conectados'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              title="Atualizar lista de participantes"
              disabled={isLoading}
              className="p-2 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#374151] hover:text-[#111827] border border-[#E5E7EB] rounded-xl transition-all cursor-pointer shadow-2xs shrink-0 disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
          {!isEmbedded && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F3F4F6] rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Participants List */}
      <div className="p-5 overflow-y-auto flex-1 space-y-2 max-h-[60vh]">
        {participants.length === 0 ? (
          <div className="text-center py-10 text-xs text-[#6B7280]">
            <Users className="w-8 h-8 text-[#9CA3AF] mx-auto mb-2 opacity-50" />
            <p className="font-bold text-[#111827]">Nenhum participante conectado no momento</p>
            <p className="mt-1 text-[#9CA3AF]">
              Os participantes aparecerão aqui automaticamente assim que entrarem na reunião.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#F3F4F6]">
            {participants.map((name, idx) => (
              <div
                key={`${name}-${idx}`}
                className="py-2.5 flex items-center justify-between text-sm"
              >
                <span className="font-semibold text-[#111827] truncate mr-2">
                  {name}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Online
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {!isEmbedded && (
        <div className="p-4 bg-[#F9FAFB] border-t border-[#E5E7EB] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-[#D1D5DB] hover:bg-[#F3F4F6] text-[#374151] text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer shadow-2xs"
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );

  if (isEmbedded) {
    return content;
  }

  return (
    <div
      id="admin-participants-modal-overlay"
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {content}
    </div>
  );
};
