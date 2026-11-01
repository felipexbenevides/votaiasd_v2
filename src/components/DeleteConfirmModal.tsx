import React from 'react';
import { AlertTriangle, Trash2, X, RefreshCw } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  type: 'meeting' | 'month' | 'year';
  meetingName?: string;
  meetingCode?: string;
  year?: number;
  monthName?: string;
  count?: number;
  isDeleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  type,
  meetingName,
  meetingCode,
  year,
  monthName,
  count = 0,
  isDeleting,
  error,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  let title = '';
  let description = '';

  if (type === 'meeting') {
    title = 'Excluir esta reunião?';
    description =
      'Esta ação excluirá permanentemente a reunião, suas pautas, votos, resultados e demais dados associados.';
  } else if (type === 'month') {
    title = `Excluir ${monthName || ''} de ${year || ''}?`;
    description = `Existem ${count} ${count === 1 ? 'reunião' : 'reuniões'} neste mês. Todas as reuniões, pautas, votos e resultados serão excluídos permanentemente.`;
  } else if (type === 'year') {
    title = `Excluir ${year || ''}?`;
    description = `Existem ${count} ${count === 1 ? 'reunião' : 'reuniões'} neste ano. Todas as reuniões, pautas, votos e resultados serão excluídos permanentemente.`;
  }

  return (
    <div
      id="modal-delete-confirm-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        id="modal-delete-confirm-content"
        className="bg-white w-full max-w-md rounded-2xl border border-[#E5E7EB] shadow-xl p-5 sm:p-6 space-y-4 sm:space-y-5 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-[#111827] break-words">{title}</h3>
              {type === 'meeting' && meetingName && (
                <p className="text-xs text-[#6B7280] font-medium mt-0.5 break-words">
                  {meetingName} {meetingCode && `(${meetingCode})`}
                </p>
              )}
            </div>
          </div>

          <button
            id="btn-delete-confirm-close-x"
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="text-[#9CA3AF] hover:text-[#111827] p-1.5 rounded-lg hover:bg-[#F3F4F6] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 text-xs text-[#4B5563] leading-relaxed">
          <p>{description}</p>
          <div className="p-3 bg-rose-50/80 border border-rose-200/80 rounded-xl text-rose-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="font-bold">Esta ação não pode ser desfeita.</span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-100 border border-rose-300 rounded-xl text-rose-900 text-xs">
            {error}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-2">
          <button
            id="btn-delete-confirm-cancel"
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#374151] bg-white hover:bg-[#F3F4F6] border border-[#E5E7EB] rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            id="btn-delete-confirm-submit"
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Excluindo...</span>
              </>
            ) : (
              <span>Excluir permanentemente</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
