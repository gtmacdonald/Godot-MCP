import { describe, expect, it, vi } from 'vitest';

type Handler = (...args: any[]) => void;

class FakeWebSocket {
  static OPEN = 1;

  readyState = FakeWebSocket.OPEN;
  private handlers: Record<string, Handler[]> = {};
  private terminated = false;
  sent: string[] = [];

  constructor(_url: string, _opts: any) {
    queueMicrotask(() => this.emit('open'));
  }

  on(event: string, handler: Handler) {
    (this.handlers[event] ??= []).push(handler);
    return this;
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.emit('close');
  }

  terminate() {
    this.terminated = true;
    this.emit('close');
  }

  emit(event: string, ...args: any[]) {
    for (const h of this.handlers[event] ?? []) h(...args);
  }

  get wasTerminated() {
    return this.terminated;
  }
}

describe('godot_connection (mocked ws)', () => {
  it('connects and resolves a command via message response', async () => {
    vi.resetModules();
    process.env.GODOT_WS_URL = 'ws://example.invalid:9080';

    vi.doMock('ws', () => ({ default: FakeWebSocket }));
    const mod = await import('./godot_connection.js');
    const conn = mod.getGodotConnection();

    await conn.connect();
    expect(conn.isConnected()).toBe(true);

    const pending = conn.sendCommand('get_project_settings', {});

    const ws = (conn as any).ws as FakeWebSocket;
    expect(ws.sent.length).toBe(1);
    const sent = JSON.parse(ws.sent[0]);
    expect(sent.type).toBe('get_project_settings');
    expect(sent.commandId).toMatch(/^cmd_/);

    ws.emit('message', Buffer.from(JSON.stringify({ status: 'success', commandId: sent.commandId, result: { ok: true } })));

    await expect(pending).resolves.toEqual({ ok: true });
  });
});

