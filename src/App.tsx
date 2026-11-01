import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ParticipantView } from './components/ParticipantView';
import { AdminView } from './components/AdminView';
import { PublicNominationView } from './components/PublicNominationView';
import { ChurchNominationPublicView } from './components/ChurchNominationPublicView';
import { PublicOrganizingCommissionView } from './components/PublicOrganizingCommissionView';
import { ChurchLogo } from './components/ChurchLogo';
import { checkUserAuth, userLogout, getStoredUser } from './services/api';
import { User } from './types';

export default function App() {
  const [viewMode, setViewMode] = useState<'participant' | 'admin'>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const params = new URLSearchParams(window.location.search);
      if (path === '/admin' || path.startsWith('/admin') || params.get('admin') !== null) {
        return 'admin';
      }
      if (params.get('code')) {
        return 'participant';
      }
    }
    return 'admin';
  });
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(getStoredUser());
  const [participantMeetingCode, setParticipantMeetingCode] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return (params.get('code') || '').trim().toUpperCase();
    }
    return '';
  });

  // Extract public nomination token from path (/indicacoes/:token) or query (?indicacoes=:token)
  const [publicNominationToken, setPublicNominationToken] = useState<string>(() => {
    const path = window.location.pathname;
    if (path.startsWith('/indicacoes/')) {
      const token = path.replace(/^\/indicacoes\/?/, '').split('/')[0];
      return token ? decodeURIComponent(token) : '';
    }
    const params = new URLSearchParams(window.location.search);
    return params.get('indicacoes') || '';
  });

  // Extract public church consultation token from path (/indicacoes-igreja/:token) or query (?indicacoes_igreja=:token)
  const [publicChurchToken, setPublicChurchToken] = useState<string>(() => {
    const path = window.location.pathname;
    if (path.startsWith('/indicacoes-igreja/')) {
      const token = path.replace(/^\/indicacoes-igreja\/?/, '').split('/')[0];
      return token ? decodeURIComponent(token) : '';
    }
    const params = new URLSearchParams(window.location.search);
    return params.get('indicacoes_igreja') || '';
  });

  // Extract public organizing commission token from path (/indicacoes-organizadora/:token) or query (?indicacoes_organizadora=:token)
  const [publicOrganizingToken, setPublicOrganizingToken] = useState<string>(() => {
    const path = window.location.pathname;
    if (path.startsWith('/indicacoes-organizadora/')) {
      const token = path.replace(/^\/indicacoes-organizadora\/?/, '').split('/')[0];
      return token ? decodeURIComponent(token) : '';
    }
    const params = new URLSearchParams(window.location.search);
    return params.get('indicacoes_organizadora') || '';
  });

  // Read URL query params and path on mount
  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname;
      const params = new URLSearchParams(window.location.search);

      if (path.startsWith('/indicacoes-organizadora/')) {
        const token = path.replace(/^\/indicacoes-organizadora\/?/, '').split('/')[0];
        setPublicOrganizingToken(token ? decodeURIComponent(token) : '');
        setPublicChurchToken('');
        setPublicNominationToken('');
        return;
      }
      const orgToken = params.get('indicacoes_organizadora');
      if (orgToken) {
        setPublicOrganizingToken(orgToken);
        setPublicChurchToken('');
        setPublicNominationToken('');
        return;
      }
      setPublicOrganizingToken('');

      if (path.startsWith('/indicacoes-igreja/')) {
        const token = path.replace(/^\/indicacoes-igreja\/?/, '').split('/')[0];
        setPublicChurchToken(token ? decodeURIComponent(token) : '');
        setPublicNominationToken('');
        return;
      }
      const churchToken = params.get('indicacoes_igreja');
      if (churchToken) {
        setPublicChurchToken(churchToken);
        setPublicNominationToken('');
        return;
      }
      setPublicChurchToken('');

      if (path.startsWith('/indicacoes/')) {
        const token = path.replace(/^\/indicacoes\/?/, '').split('/')[0];
        setPublicNominationToken(token ? decodeURIComponent(token) : '');
        return;
      }
      const indToken = params.get('indicacoes');
      if (indToken) {
        setPublicNominationToken(indToken);
        return;
      }
      setPublicNominationToken('');

      const codeParam = params.get('code');
      const adminParam = params.get('admin');
      const resetTokenParam = params.get('oobCode') || params.get('reset_token') || params.get('token');

      if (path === '/admin' || path.startsWith('/admin') || adminParam !== null || resetTokenParam) {
        setViewMode('admin');
      } else if (codeParam) {
        setParticipantMeetingCode(codeParam.trim().toUpperCase());
        setViewMode('participant');
      } else {
        setViewMode('admin');
      }
    };

    handleLocationChange();
    window.addEventListener('popstate', handleLocationChange);

    // Check user auth
    checkUserAuth().then((res) => {
      setIsAdminAuthenticated(res.authenticated);
      if (res.authenticated && res.user) {
        setCurrentUser(res.user);
      } else {
        setCurrentUser(null);
      }
    });

    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const handleAdminLogout = async () => {
    await userLogout();
    setIsAdminAuthenticated(false);
    setCurrentUser(null);
    setViewMode('admin');
  };

  // If viewing a public organizing commission link (/indicacoes-organizadora/:token)
  if (publicOrganizingToken) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] text-[#111827] flex flex-col font-sans antialiased selection:bg-[#111827] selection:text-white">
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-30 shadow-2xs">
          <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ChurchLogo className="w-8 h-8 text-[#111827]" />
              <div className="flex flex-col">
                <span className="font-bold text-base tracking-tight text-[#111827] leading-tight">
                  VOTAIASD
                </span>
                <span className="text-[10px] text-[#6B7280] font-medium leading-none">
                  Comissão Organizadora
                </span>
              </div>
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] bg-[#F3F4F6] px-2.5 py-1 rounded-full border border-[#E5E7EB]">
              Indicações
            </span>
          </div>
        </header>

        <main className="flex-1">
          <PublicOrganizingCommissionView token={publicOrganizingToken} />
        </main>
      </div>
    );
  }

  // If viewing a public nomination link (/indicacoes/:token) - Isolated public flow (PARTE 1, 2, 3, 13)
  if (publicNominationToken) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] text-[#111827] flex flex-col font-sans antialiased selection:bg-[#111827] selection:text-white">
        {/* Discrete Header without any voting or administrative navigation */}
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-30 shadow-2xs">
          <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ChurchLogo className="w-8 h-8 text-[#111827]" />
              <div className="flex flex-col">
                <span className="font-bold text-base tracking-tight text-[#111827] leading-tight">
                  VOTAIASD
                </span>
                <span className="text-[10px] text-[#6B7280] font-medium leading-none">
                  Sistema de Indicações
                </span>
              </div>
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] bg-[#F3F4F6] px-2.5 py-1 rounded-full border border-[#E5E7EB]">
              Indicações
            </span>
          </div>
        </header>

        <main className="flex-1">
          <PublicNominationView token={publicNominationToken} />
        </main>
      </div>
    );
  }

  // If viewing a public church nomination link (/indicacoes-igreja/:token)
  if (publicChurchToken) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] text-[#111827] flex flex-col font-sans antialiased selection:bg-[#111827] selection:text-white">
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-30 shadow-2xs">
          <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ChurchLogo className="w-8 h-8 text-[#111827]" />
              <div className="flex flex-col">
                <span className="font-bold text-base tracking-tight text-[#111827] leading-tight">
                  VOTAIASD
                </span>
                <span className="text-[10px] text-[#6B7280] font-medium leading-none">
                  Recomendações da Igreja
                </span>
              </div>
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#059669] bg-[#ECFDF5] px-2.5 py-1 rounded-full border border-[#A7F3D0]">
              Consulta da Igreja
            </span>
          </div>
        </header>

        <main className="flex-1">
          <ChurchNominationPublicView token={publicChurchToken} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-[#111827] flex flex-col font-sans antialiased selection:bg-[#111827] selection:text-white">
      {/* Header with Switcher when in participant mode or unauthenticated */}
      {(viewMode === 'participant' || !isAdminAuthenticated) && (
        <Header
          viewMode={viewMode}
          setViewMode={(mode) => {
            setViewMode(mode);
            if (mode === 'admin') {
              checkUserAuth().then((res) => {
                setIsAdminAuthenticated(res.authenticated);
                if (res.authenticated && res.user) {
                  setCurrentUser(res.user);
                }
              });
            }
          }}
          isAdminAuthenticated={isAdminAuthenticated}
          currentUser={currentUser}
          onAdminLogout={handleAdminLogout}
        />
      )}

      {/* Main View Area */}
      <div className="flex-1">
        {viewMode === 'participant' ? (
          <ParticipantView
            initialCode={participantMeetingCode}
            onCodeChange={(code) => {
              setParticipantMeetingCode(code);
              // Update URL without page reload for easy sharing/bookmarking
              const url = new URL(window.location.href);
              if (code) {
                url.searchParams.set('code', code);
              } else {
                url.searchParams.delete('code');
              }
              window.history.replaceState({}, '', url.toString());
            }}
          />
        ) : (
          <AdminView
            currentUser={currentUser}
            onUserChange={(user) => {
              setCurrentUser(user);
              setIsAdminAuthenticated(Boolean(user));
            }}
            onLogout={handleAdminLogout}
            onSwitchToParticipant={() => setViewMode('participant')}
          />
        )}
      </div>
    </div>
  );
}
