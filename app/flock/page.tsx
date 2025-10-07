// app/flock/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import BoidCanvas from '@/components/BoidCanvas';
import ChatLog from '@/components/ChatLog';
import ControlsPanel, { type SimConfig } from '@/components/ControlsPanel';

type PosMap = Record<string, [number, number]>;

type EventPayload =
  | { type: 'start'; goal: string; config: any }
  | { type: 'pos'; positions: PosMap }
  | { type: 'agent_message'; turn: number; agent: string; name: string; color: string; text: string; proj: number[]; active: string[] }
  | { type: 'telemetry'; turn: number; activeCount: number; avgSimilarity?: number; clusters?: number[]; meanCluster?: number }
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

  const [positions, setPositions] = useState<PosMap>({});
  const [colors, setColors] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});

  // state
  const [speakingTimes, setSpeakingTimes] = useState<Record<string, number>>({});
  const [bubbles, setBubbles] = useState<Record<string, string>>({});
  const [vizTalkRadius, setVizTalkRadius] = useState<number>(0.28);
  const bubbleHalfLifeMs = 3200; // NEW: central spot to tweak persistence

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const cancelRef = useRef<boolean>(false);

  const stop = async () => {
    cancelRef.current = true;
    setRunning(false);
    setStatus('Stopped.');
    try { await readerRef.current?.cancel(); } catch { }
  };

  const start = async (cfg: SimConfig) => {
    setMessages([]);
    setPositions({});
    setColors({});
    setNames({});
    setSpeakingTimes({});
    setBubbles({});
    setAvgSim(0);
    setVizTalkRadius(cfg.talkRadius);
    setStatus('Starting…');
    setRunning(true);
    cancelRef.current = false;

    const res = await fetch('/api/agents', { method: 'POST', body: JSON.stringify(cfg) });
    if (!res.body) { setStatus('No stream.'); setRunning(false); return; }

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

        switch (evt.type) {
          case 'start': setStatus('Agents thinking…'); break;
          case 'pos': setPositions(evt.positions); break;

          case 'agent_join':
            setNames(m => ({ ...m, [evt.agent]: evt.name }));
            setColors(m => ({ ...m, [evt.agent]: evt.color }));
            setPositions(p => ({ ...p, [evt.agent]: p[evt.agent] ?? [(Math.random() * 2 - 1) as number, (Math.random() * 2 - 1) as number] }));
            break;

          case 'agent_leave':
            setStatus(s => `${s}  [${evt.agent} left]`);
            break;

          case 'agent_message':
            setNames(m => ({ ...m, [evt.agent]: evt.name }));
            setColors(m => ({ ...m, [evt.agent]: evt.color }));
            setMessages(m => [...m, { agentId: evt.agent, agentName: evt.name, content: evt.text, turn: evt.turn, color: evt.color }]);
            setSpeakingTimes(t => ({ ...t, [evt.agent]: Date.now() }));
            setBubbles(b => {
              const short = evt.text.length > 100 ? evt.text.slice(0, 100) + '…' : evt.text;
              return { ...b, [evt.agent]: short };
            });
            break;

          case 'telemetry':
            if (typeof evt.avgSimilarity === 'number') setAvgSim(evt.avgSimilarity);
            if (evt.clusters && evt.clusters.length > 0) {
              setStatus(`Active: ${evt.activeCount} • clusters: [${evt.clusters.join(', ')}]`);
            } else {
              setStatus(`Active: ${evt.activeCount}`);
            }
            break;

          case 'done': setRunning(false); setStatus('Conversation completed.'); break;
          case 'error': setRunning(false); setStatus(`Error: ${evt.message}`); break;
        }
      }
    }
  };

  useEffect(() => {
    return () => { if (running) stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  return (
    <div className="grid grid-cols-[1fr_360px_380px] h-screen">
      <div className="relative bg-black">
        <BoidCanvas
          positions={positions}
          colors={colors}
          averageSimilarity={avgSim}
          speakingTimes={speakingTimes}
          talkRadius={vizTalkRadius}
          bubbles={bubbles}
          bubbleHalfLifeMs={bubbleHalfLifeMs}
        />
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
