import { PublicMeetingState, AdminMeetingState, PollResult } from '../types';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface SSECallbacks {
  onStatusChange?: (status: ConnectionStatus) => void;
  onPublicInit?: (state: PublicMeetingState) => void;
  onAdminInit?: (state: AdminMeetingState) => void;
  onPollChanged?: (data: PublicMeetingState | AdminMeetingState) => void;
  onVoteUpdate?: (data: { pollId: string; totalVotes: number } | PollResult) => void;
  onPresenceUpdate?: (data: { participantCount: number; participants?: string[] }) => void;
  onMeetingEnded?: (data: PublicMeetingState | AdminMeetingState) => void;
}

export class MeetingEventSource {
  private eventSource: EventSource | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isManuallyClosed = false;
  private reconnectAttempt = 0;
  private code: string;
  private token: string | null;
  private sessionId: string | null;
  private participantName: string | null;
  private callbacks: SSECallbacks;

  private readonly reconnectDelays = [1000, 2000, 5000, 10000, 30000];

  private readonly handleVisibilityChange = () => {
    if (this.isManuallyClosed || typeof document === 'undefined') return;

    if (document.visibilityState === 'hidden') {
      console.log('[SSE] página oculta — conexão suspensa');
      this.clearReconnectTimer();
      this.closeCurrentConnection();
      this.callbacks.onStatusChange?.('disconnected');
      return;
    }

    console.log('[SSE] página visível — reconectando se necessário');
    if (!this.eventSource) {
      this.reconnectAttempt = 0;
      this.connect();
    }
  };

  constructor(
    code: string,
    callbacks: SSECallbacks,
    token: string | null = null,
    sessionId: string | null = null,
    participantName: string | null = null
  ) {
    this.code = code.trim().toUpperCase();
    this.callbacks = callbacks;
    this.token = token;
    this.sessionId = sessionId;
    this.participantName = participantName;

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    this.connect();
  }

  private isPageVisible(): boolean {
    return typeof document === 'undefined' || document.visibilityState !== 'hidden';
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private closeCurrentConnection(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.isManuallyClosed || !this.isPageVisible() || this.reconnectTimeout) return;

    const delay = this.reconnectDelays[Math.min(this.reconnectAttempt, this.reconnectDelays.length - 1)];
    this.reconnectAttempt += 1;
    this.callbacks.onStatusChange?.('reconnecting');

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }

  public connect(): void {
    if (this.isManuallyClosed || !this.isPageVisible()) return;

    this.clearReconnectTimer();
    this.closeCurrentConnection();
    this.callbacks.onStatusChange?.('connecting');

    const query = new URLSearchParams();
    if (this.token) query.set('token', this.token);
    if (this.sessionId) query.set('sessionId', this.sessionId);
    if (this.participantName) query.set('name', this.participantName);

    const url = `/api/meetings/${encodeURIComponent(this.code)}/stream?${query.toString()}`;

    try {
      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        if (this.isManuallyClosed) return;
        this.reconnectAttempt = 0;
        console.log('[SSE] conectado');
        this.callbacks.onStatusChange?.('connected');
      };

      this.eventSource.onerror = () => {
        if (this.isManuallyClosed) return;
        this.closeCurrentConnection();
        this.scheduleReconnect();
      };

      this.eventSource.addEventListener('init_public', (e: MessageEvent) => {
        let isClosed = false;
        try {
          const data = JSON.parse(e.data) as PublicMeetingState;
          isClosed =
            data?.status === 'MEETING_CLOSED' ||
            (data as unknown as AdminMeetingState)?.meeting?.status === 'MEETING_CLOSED';
          this.callbacks.onPublicInit?.(data);
        } catch (err) {
          console.error('Error parsing init_public event:', err);
        } finally {
          if (isClosed) this.close();
        }
      });

      this.eventSource.addEventListener('init_admin', (e: MessageEvent) => {
        let isClosed = false;
        try {
          const data = JSON.parse(e.data) as AdminMeetingState;
          isClosed =
            data?.meeting?.status === 'MEETING_CLOSED' ||
            (data as unknown as PublicMeetingState)?.status === 'MEETING_CLOSED';
          this.callbacks.onAdminInit?.(data);
        } catch (err) {
          console.error('Error parsing init_admin event:', err);
        } finally {
          if (isClosed) this.close();
        }
      });

      this.eventSource.addEventListener('poll_changed', (e: MessageEvent) => {
        let isClosed = false;
        try {
          const data = JSON.parse(e.data);
          isClosed = data?.status === 'MEETING_CLOSED' || data?.meeting?.status === 'MEETING_CLOSED';
          this.callbacks.onPollChanged?.(data);
        } catch (err) {
          console.error('Error parsing poll_changed event:', err);
        } finally {
          if (isClosed) this.close();
        }
      });

      this.eventSource.addEventListener('vote_update', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          this.callbacks.onVoteUpdate?.(data);
        } catch (err) {
          console.error('Error parsing vote_update event:', err);
        }
      });

      this.eventSource.addEventListener('presence_update', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          this.callbacks.onPresenceUpdate?.(data);
        } catch (err) {
          console.error('Error parsing presence_update event:', err);
        }
      });

      this.eventSource.addEventListener('meeting_ended', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          this.callbacks.onMeetingEnded?.(data);
        } catch (err) {
          console.error('Error parsing meeting_ended event:', err);
        } finally {
          console.log('[SSE] reunião encerrada');
          this.close();
        }
      });
    } catch (err) {
      console.error('Failed to create EventSource:', err);
      this.closeCurrentConnection();
      this.scheduleReconnect();
    }
  }

  public close(): void {
    if (this.isManuallyClosed) return;

    this.isManuallyClosed = true;
    this.clearReconnectTimer();
    this.closeCurrentConnection();

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }

    console.log('[SSE] desconectado');
    this.callbacks.onStatusChange?.('disconnected');
  }
}
