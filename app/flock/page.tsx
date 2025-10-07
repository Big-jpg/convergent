// app/flock/page.tsx
'use client';

import { useRef, useState } from 'react';
import BoidCanvas from '@/components/BoidCanvas';
import ChatLog from '@/components/ChatLog';
import ControlsPanel, { type SimConfig } from '@/components/ControlsPanel';

type ConsensusItem = { size: number; support: number; proposal: string };

type EventPayload =
  | { type: 'start'; goal: string; config: any }
  | { type: 'pos'; positions: Record<string, [number, number]> }
  | {
    type: 'agent_message';
    turn: number;
    agent: string;
    name: string;
    color: string;
    text: string;
    proj: number[];
    active: string[];
    // new metadata
    vpLabel?: string | null;
    stance?: number; // -1 | 0 | +1
    proposal?: string;
  }
  | {
    type: 'telemetry';
    turn: number;
    activeCount: number;
    avgSimilarity?: number;
    clusters?: number[];
    meanCluster?: number;
    // new: per-cluster consensus (already normalized to 0..1 support)
    consensus?: ConsensusItem[];
  }
  | { type: 'agent_join'; turn: number; agent: string; name: string; color: string }
  | { type: 'agent_leave'; turn: number; agent: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

type Msg = {
  agentId: string;
  agentName: string;
  content: string;
  turn: number;
  color: string;
  // new columns for side log
  vpLabel?: string | null;
  stance?: number;
  proposal?: string;
};

export default function FlockPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [avgSim, setAvgSim] = useState(0);
  const [status, setStatus] = useState('Idle.');
  const [running, setRunning] = useState(false);

  // Dynamic agent maps
  const [positions, setPositions] = useState<Record<string, [number, number]>>({});
  const [colors, setColors] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [talkRadius, setTalkRadius] = useState<number>(0.28);

  // last-spoke timestamps (ms) for glow/pulse in canvas
  const [lastSpokeAt, setLastSpokeAt] = useState<Record<string, number>>({});

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const cancelRef = useRef<boolean>(false);

  const stop = async () => {
    cancelRef.current = true;
    setRunning(false);
    setStatus('Stopped.');
    try {
      await readerRef.current?.cancel();
    } catch { }
  };

  const start = async (cfg: SimConfig) => {
    setMessages([]);
    setPositions({});
    setColors({});
    setNames({});
    setAvgSim(0);
    setLastSpokeAt({});
    setStatus('Starting…');
    setRunning(true);
    cancelRef.current = false;

    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...cfg,
        adaptWeights: cfg.adaptWeights,
        perAgentWeights: cfg.perAgentWeights,
        adaptRate: cfg.adaptRate,
      }),
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
          if ((evt as any).config?.talkRadius) setTalkRadius((evt as any).config.talkRadius);
        } else if (evt.type === 'pos') {
          setPositions(evt.positions);
        } else if (evt.type === 'agent_join') {
          setNames((m) => ({ ...m, [evt.agent]: evt.name }));
          setColors((m) => ({ ...m, [evt.agent]: evt.color }));
          setPositions((p) => ({
            ...p,
            [evt.agent]: [(Math.random() * 2 - 1) as number, (Math.random() * 2 - 1) as number],
          }));
        } else if (evt.type === 'agent_leave') {
          setStatus((s) => `${s}  [${evt.agent} left]`);
        } else if (evt.type === 'agent_message') {
          // register or update identity + position
          setNames((m) => ({ ...m, [evt.agent]: evt.name }));
          setColors((m) => ({ ...m, [evt.agent]: evt.color }));
          setPositions((p) => ({
            ...p,
            [evt.agent]: [evt.proj?.[0] ?? 0, evt.proj?.[1] ?? 0],
          }));

          // append to side chat (we removed floating bubbles in canvas)
          setMessages((m) => [
            ...m,
            {
              agentId: evt.agent,
              agentName: evt.name,
              content: evt.text,
              turn: evt.turn,
              color: evt.color,
              vpLabel: evt.vpLabel ?? undefined,
              stance: evt.stance,
              proposal: evt.proposal,
            },
          ]);

          // glow the speaker
          const now = Date.now();
          setLastSpokeAt((s) => ({ ...s, [evt.agent]: now }));
        } else if (evt.type === 'telemetry') {
          if (evt.avgSimilarity !== undefined) setAvgSim(evt.avgSimilarity);

          // Build a compact status line including clusters and (if present) one consensus highlight
          let base = `Active: ${evt.activeCount}`;
          if (evt.clusters?.length) base += ` • Clusters: ${evt.clusters.join(', ')}`;
          const firstConsensus = evt.consensus?.[0];
          if (firstConsensus) {
            const pct = Math.round(firstConsensus.support * 100);
            base += ` • Consensus: ${pct}% favor “${firstConsensus.proposal}”`;
          }
          setStatus(base);
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
        <BoidCanvas
          positions={positions}
          colors={colors}
          averageSimilarity={avgSim}
          lastSpokeAt={lastSpokeAt}
          talkRadius={talkRadius}
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
