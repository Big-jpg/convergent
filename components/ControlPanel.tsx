'use client';

import { useState } from 'react';

export type SimConfig = {
  agentCount: number;              // how many agents active at start
  maxTurns: number;                // total turns budget
  maxContextMessages: number;      // rolling context window (messages)
  maxTokens: number;               // per-reply token cap
  temperature: number;             // base temp for all agents (quick global)
  joinProb: number;                // per-turn chance an inactive agent joins
  leaveProb: number;               // per-turn chance a random active agent leaves
  turnDelayMs: number;             // delay between agent replies (UX pacing)
  model: 'gpt-4o-mini' | 'gpt-4o'; // quick toggle for speed vs quality
  goal: string;                    // discussion goal/topic
};

type Props = {
  running: boolean;
  onStart: (cfg: SimConfig) => void;
  onStop: () => void;
};

const defaults: SimConfig = {
  agentCount: 3,
  maxTurns: 6,
  maxContextMessages: 8,
  maxTokens: 160,
  temperature: 0.6,
  joinProb: 0.25,
  leaveProb: 0.15,
  turnDelayMs: 200,
  model: 'gpt-4o-mini',
  goal:
    'Identify the fastest viable path to minimum-operational lunar power by 2040 (trade solar vs nuclear vs hybrid).',
};

export default function ControlsPanel({ running, onStart, onStop }: Props) {
  const [cfg, setCfg] = useState<SimConfig>(defaults);

  const bind =
    <K extends keyof SimConfig>(key: K) =>
    (v: SimConfig[K]) =>
      setCfg((c) => ({ ...c, [key]: v }));

  return (
    <div className="bg-slate-900 text-slate-100 p-4 space-y-4 border-l border-slate-800 h-full">
      <h2 className="text-lg font-semibold">Controls</h2>

      <label className="block text-sm">
        Goal
        <textarea
          className="mt-1 w-full bg-slate-800 rounded p-2 text-sm"
          rows={3}
          value={cfg.goal}
          onChange={(e) => bind('goal')(e.target.value)}
          disabled={running}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          Agents (start)
          <input
            type="number"
            min={2}
            max={12}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.agentCount}
            onChange={(e) => bind('agentCount')(parseInt(e.target.value || '0', 10))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Max turns
          <input
            type="number"
            min={1}
            max={50}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.maxTurns}
            onChange={(e) => bind('maxTurns')(parseInt(e.target.value || '0', 10))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Context window (msgs)
          <input
            type="number"
            min={2}
            max={50}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.maxContextMessages}
            onChange={(e) => bind('maxContextMessages')(parseInt(e.target.value || '0', 10))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Max tokens / reply
          <input
            type="number"
            min={48}
            max={400}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.maxTokens}
            onChange={(e) => bind('maxTokens')(parseInt(e.target.value || '0', 10))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Temperature
          <input
            type="number"
            step="0.1"
            min={0}
            max={1.5}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.temperature}
            onChange={(e) => bind('temperature')(parseFloat(e.target.value || '0'))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Turn delay (ms)
          <input
            type="number"
            min={0}
            max={3000}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.turnDelayMs}
            onChange={(e) => bind('turnDelayMs')(parseInt(e.target.value || '0', 10))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Join probability
          <input
            type="number"
            step="0.05"
            min={0}
            max={1}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.joinProb}
            onChange={(e) => bind('joinProb')(parseFloat(e.target.value || '0'))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Leave probability
          <input
            type="number"
            step="0.05"
            min={0}
            max={1}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.leaveProb}
            onChange={(e) => bind('leaveProb')(parseFloat(e.target.value || '0'))}
            disabled={running}
          />
        </label>

        <label className="block text-sm col-span-2">
          Model
          <select
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.model}
            onChange={(e) => bind('model')(e.target.value as SimConfig['model'])}
            disabled={running}
          >
            <option value="gpt-4o-mini">gpt-4o-mini (faster)</option>
            <option value="gpt-4o">gpt-4o (higher quality)</option>
          </select>
        </label>
      </div>

      <div className="flex gap-2">
        {!running ? (
          <button
            className="bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded text-sm font-medium"
            onClick={() => onStart(cfg)}
          >
            Start Simulation
          </button>
        ) : (
          <button
            className="bg-rose-600 hover:bg-rose-500 px-3 py-2 rounded text-sm font-medium"
            onClick={onStop}
          >
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
