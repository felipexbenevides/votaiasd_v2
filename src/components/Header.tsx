import React from 'react';
import { LogOut, User } from 'lucide-react';
import { ConnectionStatus } from '../services/realtime';
import { ChurchLogo } from './ChurchLogo';
import { User as UserType } from '../types';

interface HeaderProps {
  viewMode: 'participant' | 'admin';
  setViewMode: (mode: 'participant' | 'admin') => void;
  isAdminAuthenticated: boolean;
  currentUser?: UserType | null;
  onAdminLogout: () => void;
  connectionStatus?: ConnectionStatus;
  meetingCode?: string;
  meetingName?: string;
}

export const Header: React.FC<HeaderProps> = ({
  viewMode,
  setViewMode,
  isAdminAuthenticated,
  currentUser,
  onAdminLogout,
  connectionStatus,
  meetingCode,
  meetingName,
}) => {
  return (
    <header id="app-header" className="h-16 bg-white border-b border-[#E5E7EB] px-2.5 sm:px-8 flex items-center justify-between sticky top-0 z-30">
      {/* Brand & Context */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <ChurchLogo className="w-7 h-7 sm:w-9 sm:h-9 text-[#111827] shrink-0" />

        {/* Desktop Brand (sm and above) */}
        <div className="hidden sm:flex items-center gap-3 min-w-0">
          <div className="inline-flex flex-col items-center justify-center text-center">
            <span className="text-base sm:text-lg font-bold tracking-tight text-[#111827] leading-none text-center">
              VOTAIASD
            </span>
            <span className="text-[8px] sm:text-[9px] text-[#9CA3AF] font-medium tracking-tight leading-none mt-1 text-center whitespace-nowrap">
              by Pr Paulo Roberto
            </span>
          </div>

          <span className="text-[#D1D5DB] font-light text-base select-none">|</span>

          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs sm:text-sm text-[#6B7280] font-medium uppercase tracking-widest truncate">
              {viewMode === 'admin' ? 'Admin Console' : 'Votação Anônima'}
            </span>

            {connectionStatus === 'connected' && meetingCode && (
              <div className="hidden md:flex items-center gap-2 px-2.5 py-0.5 bg-green-50 text-green-700 rounded-full border border-green-100 ml-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Reunião Ativa</span>
              </div>
            )}
            {connectionStatus === 'reconnecting' && (
              <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 ml-1">
                Reconectando...
              </span>
            )}
          </div>

          {meetingName && meetingCode && (
            <p className="text-[11px] text-[#6B7280] font-normal truncate max-w-xs ml-2">
              {meetingName} <span className="font-mono text-[#111827] font-semibold">({meetingCode})</span>
            </p>
          )}
        </div>

        {/* Mobile Brand (below sm) - Strict Column Layout without Overlap */}
        <div className="flex sm:hidden items-center gap-2 min-w-0">
          <div className="inline-flex flex-col items-center justify-center text-center shrink-0">
            <span className="text-sm font-bold tracking-tight text-[#111827] leading-none text-center">
              VOTAIASD
            </span>
            <span className="text-[7.5px] text-[#9CA3AF] font-medium tracking-tight leading-none mt-0.5 text-center whitespace-nowrap">
              by Pr Paulo Roberto
            </span>
          </div>
          <span className="text-[#E5E7EB] font-light text-xs select-none">|</span>
          <span className="text-[8.5px] text-[#4B5563] font-bold uppercase tracking-wider leading-none truncate">
            {viewMode === 'admin' ? 'Admin' : 'Votação'}
          </span>
        </div>
      </div>

      {/* View Switcher & Actions */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {viewMode === 'admin' && isAdminAuthenticated && currentUser && (
          <div className="flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#374151]">
            <User className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#6B7280] shrink-0" />
            <span className="font-semibold truncate max-w-[70px] sm:max-w-[140px] text-[11px] sm:text-xs">
              {currentUser.username}
            </span>
          </div>
        )}

        {/* No administrative actions visible in participant mode */}

        {viewMode === 'admin' && isAdminAuthenticated && (
          <button
            id="header-btn-logout"
            type="button"
            onClick={onAdminLogout}
            title="Sair da conta"
            className="p-1.5 sm:p-2 text-[#6B7280] hover:text-rose-600 hover:bg-[#F3F4F6] border border-[#E5E7EB] rounded-xl transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        )}
      </div>
    </header>
  );
};
