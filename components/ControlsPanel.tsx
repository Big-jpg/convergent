'use client';

import { useState } from 'react';

export type SimConfig = {
  agentCount: number;
  maxTurns: number;
  maxContextMessages: number;
  maxTokens: number;
  temperature: number;
  joinProb: number;
  leaveProb: number;
  turnDelayMs: number;
  model: 'gpt-4o-mini' | 'gpt-4o';
  goal: string;

  // Boids (global)
  talkRadius: number;   // who can converse
  perception: number;   // neighbor sensing radius
  maxSpeed: number;     // velocity clamp
  alignW: number;       // alignment weight
  cohereW: number;      // cohesion weight
  separateW: number;    // separation weight

  // Conversation & motion dynamics
  activityRate: number; // physics ticks per turn multiplier (0.3..4)
  speakRate: number;    // chance an agent in a cluster speaks (0.1..1)
  wanderW: number;      // random drift force (0..1.5)
  speedJitter: number;  // per-agent maxSpeed variance (0..0.6)

  // Multi-viewpoint + persona variance
  viewpoints: string[];
  tempJitter: number;   // per-agent temp variance (0..0.8)
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
  turnDelayMs: 120,
  model: 'gpt-4o-mini',
  goal:
    'Identify the fastest viable path to minimum-operational lunar power by 2040 (trade solar vs nuclear vs hybrid).',

  // Boids
  talkRadius: 0.28,
  perception: 0.45,
  maxSpeed: 0.035,
  alignW: 0.8,
  cohereW: 0.6,
  separateW: 1.2,

  // Dynamics
  activityRate: 1.6,
  speakRate: 0.6,
  wanderW: 0.45,
  speedJitter: 0.3,

  // Viewpoints & variance
  viewpoints: [
    'Viewpoint A: Maximize public safety',
    'Viewpoint B: Maximize individual rights',
    'Viewpoint C: Balance & evidence-driven',
  ],
  tempJitter: 0.2,
};

export default function ControlsPanel({ running, onStart, onStop }: Props) {
  const [cfg, setCfg] = useState<SimConfig>(defaults);
  const [vpText, setVpText] = useState<string>(defaults.viewpoints.join('\n'));

  const bind =
    <K extends keyof SimConfig>(key: K) =>
      (v: SimConfig[K]) =>
        setCfg((c) => ({ ...c, [key]: v }));

  const start = () => {
    const viewpoints = vpText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    onStart({ ...cfg, viewpoints });
  };

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

      <label className="block text-sm">
        Viewpoints (one per line)
        <textarea
          className="mt-1 w-full bg-slate-800 rounded p-2 text-sm"
          rows={4}
          value={vpText}
          onChange={(e) => setVpText(e.target.value)}
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
            step="0.05"
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

        {/* --- Boid params --- */}
        <label className="block text-sm">
          Talk radius
          <input
            type="number" step="0.01" min={0.05} max={1}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.talkRadius}
            onChange={(e) => bind('talkRadius')(parseFloat(e.target.value || '0'))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Perception
          <input
            type="number" step="0.01" min={0.1} max={1.5}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.perception}
            onChange={(e) => bind('perception')(parseFloat(e.target.value || '0'))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Max speed
          <input
            type="number" step="0.005" min={0.005} max={0.1}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.maxSpeed}
            onChange={(e) => bind('maxSpeed')(parseFloat(e.target.value || '0'))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Align W
          <input
            type="number" step="0.1" min={0} max={3}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.alignW}
            onChange={(e) => bind('alignW')(parseFloat(e.target.value || '0'))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Cohere W
          <input
            type="number" step="0.1" min={0} max={3}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.cohereW}
            onChange={(e) => bind('cohereW')(parseFloat(e.target.value || '0'))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Separate W
          <input
            type="number" step="0.1" min={0} max={3}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.separateW}
            onChange={(e) => bind('separateW')(parseFloat(e.target.value || '0'))}
            disabled={running}
          />
        </label>

        {/* --- Dynamics --- */}
        <label className="block text-sm">
          Activity rate
          <input
            type="number" step="0.1" min={0.3} max={4}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.activityRate}
            onChange={(e) => bind('activityRate')(parseFloat(e.target.value || '0'))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Speak rate
          <input
            type="number" step="0.05" min={0.1} max={1}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.speakRate}
            onChange={(e) => bind('speakRate')(parseFloat(e.target.value || '0'))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Wander W
          <input
            type="number" step="0.05" min={0} max={1.5}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.wanderW}
            onChange={(e) => bind('wanderW')(parseFloat(e.target.value || '0'))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Speed jitter
          <input
            type="number" step="0.05" min={0} max={0.6}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.speedJitter}
            onChange={(e) => bind('speedJitter')(parseFloat(e.target.value || '0'))}
            disabled={running}
          />
        </label>

        {/* --- Join/leave --- */}
        <label className="block text-sm">
          Join probability
          <input
            type="number" step="0.05" min={0} max={1}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.joinProb}
            onChange={(e) => bind('joinProb')(parseFloat(e.target.value || '0'))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Leave probability
          <input
            type="number" step="0.05" min={0} max={1}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.leaveProb}
            onChange={(e) => bind('leaveProb')(parseFloat(e.target.value || '0'))}
            disabled={running}
          />
        </label>

        {/* --- Persona variance --- */}
        <label className="block text-sm">
          Temp jitter
          <input
            type="number" step="0.05" min={0} max={0.8}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.tempJitter}
            onChange={(e) => bind('tempJitter')(parseFloat(e.target.value || '0'))}
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
            onClick={start}
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
