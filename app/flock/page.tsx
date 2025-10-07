// app/flock/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import BoidCanvas from '@/components/BoidCanvas';
import ChatLog from '@/components/ChatLog';
import ControlsPanel, { type SimConfig } from '@/components/ControlPanel';

type EventPayload =
  | { type: 'start'; goal: string; config: any }
  | { type: 'agent_message'; turn: number; agent: string; name: string; color: string; text: string; proj: number[]; active: string[] }
  | { type: 'telemetry'; turn: number; activeCount: number; avgSimilarity: number }
  | { type: 'agent_join'; turn: number; agent: string; name: string; color: string }
  | { type: 'agent_leave'; turn: number; agent: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

type Msg = { agentId: string; agentName: string; content: string; turn: number; color: string };

export default function FlockPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [avgSim, setAvgSim] = useState(0);
  const [status, setStatus] = useState('Idle.');
  const [running, setRunning] = useState(false);

  // Dynamic agent maps
  const [positions, setPositions] = useState<Record<string, [number, number]>>({});
  const [colors, setColors] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const cancelRef = useRef<boolean>(false);

  const stop = async () => {
    cancelRef.current = true;
    setRunning(false);
    setStatus('Stopped.');
    try {
      await readerRef.current?.cancel();
    } catch {}
  };

  const start = async (cfg: SimConfig) => {
    setMessages([]);
    setPositions({});
    setColors({});
    setNames({});
    setAvgSim(0);
    setStatus('Starting…');
    setRunning(true);
    cancelRef.current = false;

    const res = await fetch('/api/agents', {
      method: 'POST',
      body: JSON.stringify(cfg),
    });

    if (!res.body) {
      setStatus('No stream.');
      setRunning(false);
      return;
    }

    readerRef.current = res.body.getReader();
    const decoder = new TextDecoder();

    while (!cancelRef.current) {
      const { value, done } = await readerRef.current.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });

      for (const block of chunk.split('\n\n')) {
        const line = block.trim();
        if (!line.startsWith('data:')) continue;
        const evt = JSON.parse(line.slice(5).trim()) as EventPayload;

        if (evt.type === 'start') {
          setStatus('Agents thinking…');
        } else if (evt.type === 'agent_join') {
          setNames((m) => ({ ...m, [evt.agent]: evt.name }));
          setColors((m) => ({ ...m, [evt.agent]: evt.color }));
          setPositions((p) => ({ ...p, [evt.agent]: [(Math.random() * 2 - 1) as number, (Math.random() * 2 - 1) as number] }));
        } else if (evt.type === 'agent_leave') {
          setStatus((s) => `${s}  [${evt.agent} left]`);
        } else if (evt.type === 'agent_message') {
          // register color/name if new
          setNames((m) => ({ ...m, [evt.agent]: evt.name }));
          setColors((m) => ({ ...m, [evt.agent]: evt.color }));
          setPositions((p) => ({
            ...p,
            [evt.agent]: [evt.proj?.[0] ?? 0, evt.proj?.[1] ?? 0],
          }));
          setMessages((m) => [
            ...m,
            { agentId: evt.agent, agentName: evt.name, content: evt.text, turn: evt.turn, color: evt.color },
          ]);
        } else if (evt.type === 'telemetry') {
          setAvgSim(evt.avgSimilarity);
          setStatus(`Active: ${evt.activeCount} • Avg sim ${(evt.avgSimilarity * 100).toFixed(1)}%`);
        } else if (evt.type === 'done') {
          setRunning(false);
          setStatus('Conversation completed.');
        } else if (evt.type === 'error') {
          setRunning(false);
          setStatus(`Error: ${evt.message}`);
        }
      }
    }
  };

  return (
    <div className="grid grid-cols-[1fr_360px_380px] h-screen">
      <div className="relative bg-black">
        <BoidCanvas positions={positions} colors={colors} averageSimilarity={avgSim} />
        <div className="absolute left-4 bottom-4 bg-gray-800 text-white px-3 py-2 rounded">
          {status}
        </div>
      </div>

      <aside className="bg-slate-900 text-slate-100 p-4 overflow-y-auto">
        <ChatLog messages={messages} />
      </aside>

      <aside>
        <ControlsPanel running={running} onStart={start} onStop={stop} />
      </aside>
    </div>
  );
}
