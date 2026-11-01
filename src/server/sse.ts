import { Response } from 'express';
import { db } from './db';
import { presenceTracker } from './presence';

interface ClientConnection {
  id: string;
  meetingCode: string;
  res: Response;
  isAdmin: boolean;
  sessionId?: string;
  participantName?: string;
  autoCloseTimer?: ReturnType<typeof setTimeout>;
}

class SSEManager {
  private clients: ClientConnection[] = [];
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private readonly MAX_SSE_DURATION = 20 * 60 * 1000;
  private readonly HEARTBEAT_INTERVAL = 30000;

  constructor() {
    // Listen to presence updates from presenceTracker
    presenceTracker.setListener((code) => {
      this.broadcastParticipantCount(code);
    });
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval || this.clients.length === 0) return;

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeatIfIdle(): void {
    if (this.clients.length === 0 && this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private sendHeartbeat() {
    for (const client of this.clients) {
      try {
        client.res.write(':keep-alive\n\n');
      } catch {
        this.removeClient(client.id);
      }
    }
  }

  public addClient(
    id: string,
    meetingCode: string,
    res: Response,
    isAdmin = false,
    sessionId?: string,
    participantName?: string
  ): void {
    // Set proper SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const client: ClientConnection = {
      id,
      meetingCode: meetingCode.toUpperCase(),
      res,
      isAdmin,
      sessionId,
      participantName,
    };

    // If the meeting is already closed, send terminal initial snapshot and immediately close the stream
    const existingMeeting = db.getMeetingByCode(meetingCode);
    if (existingMeeting && existingMeeting.status === 'MEETING_CLOSED') {
      this.sendInitialState(client);
      setTimeout(() => {
        try {
          res.end();
        } catch {
          // ignore
        }
      }, 500);
      return;
    }

    client.autoCloseTimer = setTimeout(() => {
      console.log(`[SSE] timeout de 20 minutos: ${client.id} (${client.meetingCode})`);
      try {
        client.res.end();
      } finally {
        this.removeClient(client.id);
      }
    }, this.MAX_SSE_DURATION);

    this.clients.push(client);
    this.startHeartbeat();
    console.log(`[SSE] conectado: ${client.id} (${client.meetingCode})`);

    // If it is an anonymous participant, record presence
    if (!isAdmin && sessionId) {
      presenceTracker.touch(client.meetingCode, sessionId, participantName);
    }

    // When connection terminates
    res.on('close', () => {
      this.removeClient(id);
    });

    res.on('error', () => {
      this.removeClient(id);
    });

    // Send initial snapshot immediately to the newly connected client
    this.sendInitialState(client);

    // Notify others of updated participant count
    this.broadcastParticipantCount(meetingCode);
  }

  public removeClient(id: string): void {
    const idx = this.clients.findIndex((c) => c.id === id);
    if (idx !== -1) {
      const client = this.clients[idx];
      if (client.autoCloseTimer) {
        clearTimeout(client.autoCloseTimer);
      }
      this.clients.splice(idx, 1);
      console.log(`[SSE] desconectado: ${client.id} (${client.meetingCode})`);
      this.stopHeartbeatIfIdle();
      // Note: We do NOT delete sessionId immediately here on TCP disconnect,
      // because page reloads momentarily close the TCP connection before reopening.
      // presenceTracker TTL handles disconnection or explicit leave cleanly.
    }
  }

  public getParticipantCount(meetingCode: string): number {
    const code = meetingCode.toUpperCase();
    return presenceTracker.getCount(code);
  }

  public getParticipants(meetingCode: string): string[] {
    const code = meetingCode.toUpperCase();
    return presenceTracker.getParticipants(code);
  }

  private sendInitialState(client: ClientConnection): void {
    const participantCount = this.getParticipantCount(client.meetingCode);

    if (client.isAdmin) {
      const participants = this.getParticipants(client.meetingCode);
      const adminState = db.getAdminMeetingState(client.meetingCode, participantCount, participants);
      if (adminState) {
        this.sendEventToClient(client, 'init_admin', adminState);
      }
    } else {
      const publicState = db.getPublicMeetingState(client.meetingCode, participantCount);
      if (publicState) {
        this.sendEventToClient(client, 'init_public', publicState);
      }
    }
  }

  private sendEventToClient(
    client: ClientConnection,
    eventName: string,
    data: unknown
  ): void {
    try {
      client.res.write(`event: ${eventName}\n`);
      client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      this.removeClient(client.id);
    }
  }

  public broadcastToMeeting(
    meetingCode: string,
    eventName: string,
    participantData: unknown,
    adminData?: unknown
  ): void {
    const code = meetingCode.toUpperCase();
    for (const client of this.clients) {
      if (client.meetingCode === code) {
        if (client.isAdmin && adminData !== undefined) {
          this.sendEventToClient(client, eventName, adminData);
        } else {
          this.sendEventToClient(client, eventName, participantData);
        }
      }
    }
  }

  public broadcastParticipantCount(meetingCode: string): void {
    const code = meetingCode.toUpperCase();
    const count = this.getParticipantCount(code);
    const participants = this.getParticipants(code);

    const publicState = db.getPublicMeetingState(code, count);
    const adminState = db.getAdminMeetingState(code, count, participants);

    for (const client of this.clients) {
      if (client.meetingCode === code) {
        if (client.isAdmin && adminState) {
          this.sendEventToClient(client, 'presence_update', {
            participantCount: count,
            participants,
          });
        } else if (publicState) {
          this.sendEventToClient(client, 'presence_update', { participantCount: count });
        }
      }
    }
  }

  public notifyPollChanged(meetingCode: string): void {
    const code = meetingCode.toUpperCase();
    const count = this.getParticipantCount(code);
    const participants = this.getParticipants(code);
    const publicState = db.getPublicMeetingState(code, count);
    const adminState = db.getAdminMeetingState(code, count, participants);

    this.broadcastToMeeting(code, 'poll_changed', publicState, adminState);
  }

  public notifyVoteRegistered(meetingCode: string, pollId: string): void {
    const code = meetingCode.toUpperCase();
    const count = this.getParticipantCount(code);
    const adminResult = db.calculatePollResult(pollId);

    // To participants: only send updated total votes count (or nothing to keep zero distraction)
    const participantPayload = {
      pollId,
      totalVotes: adminResult?.totalVotes ?? 0,
    };

    // To admin: send full updated PollResult
    this.broadcastToMeeting(code, 'vote_update', participantPayload, adminResult);
  }

  public notifyMeetingEnded(meetingCode: string): void {
    const code = meetingCode.toUpperCase();
    const count = this.getParticipantCount(code);
    const participants = this.getParticipants(code);
    const publicState = db.getPublicMeetingState(code, count);
    const adminState = db.getAdminMeetingState(code, count, participants);

    this.broadcastToMeeting(code, 'meeting_ended', publicState, adminState);

    // Controlled termination of SSE streams for the ended meeting:
    // Allow a short 1000ms delay to ensure the 'meeting_ended' event is flushed to clients,
    // then close the HTTP responses cleanly to prevent idle connections from lingering indefinitely.
    setTimeout(() => {
      const remainingForMeeting = this.clients.filter((c) => c.meetingCode === code);
      for (const client of remainingForMeeting) {
        try {
          client.res.end();
        } catch {
          // ignore
        }
      }
      for (const client of remainingForMeeting) {
        if (client.autoCloseTimer) {
          clearTimeout(client.autoCloseTimer);
        }
      }
      this.clients = this.clients.filter((c) => c.meetingCode !== code);
      this.stopHeartbeatIfIdle();
      console.log(`[SSE] reunião encerrada: conexões fechadas para ${code}`);
    }, 1000);
  }
}

export const sseManager = new SSEManager();
