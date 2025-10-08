'use client';

import { useMemo, useState } from 'react';

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

  // Adaptive dynamics
  adaptWeights?: boolean;
  perAgentWeights?: boolean;
  adaptRate?: number;
};

type Props = {
  running: boolean;
  onStart: (cfg: SimConfig) => void;
  onStop: () => void;
};

const defaults: SimConfig = {
  agentCount: 4,
  maxTurns: 10,
  maxContextMessages: 10,
  maxTokens: 200,
  temperature: 0.7,
  joinProb: 0.20,
  leaveProb: 0.10,
  turnDelayMs: 200,
  model: 'gpt-4o-mini',
  goal:
    'Should governments implement universal basic income funded through AI taxation, or would that erode human ambition and innovation?',

  // Boids
  talkRadius: 0.30,
  perception: 0.45,
  maxSpeed: 0.035,
  alignW: 0.8,
  cohereW: 0.6,
  separateW: 1.2,

  // Dynamics
  activityRate: 1.4,
  speakRate: 0.6,
  wanderW: 0.50,
  speedJitter: 0.25,

  // Viewpoints & variance
  viewpoints: [
    'Authoritarian Left | humor=light, direction=decider, rigor=data, optimism=high',
    'Libertarian Left | humor=playful, direction=explorer, rigor=anecdotal, naivety=high, optimism=med',
    'Authoritarian Right | humor=dry, direction=decider, rigor=balanced, snark=high',
    'Libertarian Right | humor=light, direction=wanderer, rigor=balanced, optimism=high',
  ],
  tempJitter: 0.25,

  // Adaptive
  adaptWeights: true,
  perAgentWeights: true,
  adaptRate: 0.15,
};

/* ---------------- Presets ---------------- */

type Preset = {
  id: string;
  name: string;
  hint: string;
  cfg: Partial<SimConfig>;
  viewpoints?: string[];
  goal?: string;
};

const PRESETS: Preset[] = [
  {
    id: 'political_compass',
    name: 'Political Compass (4 corners)',
    hint: 'Distinct factions, vivid debate, gradual convergence.',
    goal:
      'Should governments adopt UBI funded by AI taxation — or would that erode human ambition and innovation?',
    viewpoints: [
      'Authoritarian Left | humor=light, direction=decider, rigor=data',
      'Libertarian Left | humor=playful, direction=explorer, rigor=anecdotal, naivety=high',
      'Authoritarian Right | humor=dry, direction=decider, rigor=balanced, snark=high',
      'Libertarian Right | humor=light, direction=wanderer, rigor=balanced, optimism=high',
    ],
    cfg: {
      agentCount: 4,
      maxTurns: 10,
      talkRadius: 0.30,
      perception: 0.45,
      maxSpeed: 0.035,
      alignW: 0.6,
      cohereW: 0.7,
      separateW: 1.3,
      activityRate: 1.4,
      speakRate: 0.7,
      wanderW: 0.5,
      speedJitter: 0.25,
      tempJitter: 0.25,
      adaptWeights: true,
      perAgentWeights: true,
      adaptRate: 0.18,
    },
  },
  {
    id: 'polarized_debate',
    name: 'Polarized Debate',
    hint: 'Hard factions, slower consensus, sharper motion.',
    cfg: {
      agentCount: 6,
      maxTurns: 12,
      talkRadius: 0.24,
      perception: 0.42,
      alignW: 0.55,
      cohereW: 0.55,
      separateW: 1.6,
      wanderW: 0.55,
      activityRate: 1.6,
      speakRate: 0.65,
      tempJitter: 0.30,
      adaptWeights: true,
      perAgentWeights: true,
      adaptRate: 0.12,
    },
  },
  {
    id: 'consensus_workshop',
    name: 'Consensus Workshop',
    hint: 'Cooperative behavior; finds middle quickly.',
    cfg: {
      agentCount: 5,
      maxTurns: 8,
      talkRadius: 0.36,
      perception: 0.5,
      alignW: 1.0,
      cohereW: 0.85,
      separateW: 0.9,
      wanderW: 0.3,
      activityRate: 1.2,
      speakRate: 0.55,
      tempJitter: 0.18,
      adaptWeights: true,
      perAgentWeights: true,
      adaptRate: 0.2,
    },
  },
  {
    id: 'chaotic_agora',
    name: 'Chaotic Agora',
    hint: 'Noisy square; ideas collide; unpredictable arcs.',
    cfg: {
      agentCount: 8,
      maxTurns: 10,
      talkRadius: 0.26,
      perception: 0.48,
      alignW: 0.5,
      cohereW: 0.55,
      separateW: 1.45,
      wanderW: 0.9,
      speedJitter: 0.35,
      activityRate: 1.8,
      speakRate: 0.8,
      tempJitter: 0.35,
      adaptWeights: true,
      perAgentWeights: true,
      adaptRate: 0.22,
    },
  },
  {
    id: 'calm_seminar',
    name: 'Calm Seminar',
    hint: 'Gentle motion, clear turn-taking, low heat.',
    cfg: {
      agentCount: 4,
      maxTurns: 8,
      talkRadius: 0.34,
      perception: 0.46,
      alignW: 0.8,
      cohereW: 0.7,
      separateW: 1.0,
      wanderW: 0.25,
      activityRate: 1.0,
      speakRate: 0.45,
      tempJitter: 0.15,
      adaptWeights: true,
      perAgentWeights: true,
      adaptRate: 0.10,
      turnDelayMs: 260,
    },
  },
];

export default function ControlsPanel({ running, onStart, onStop }: Props) {
  const [cfg, setCfg] = useState<SimConfig>(defaults);
  const [vpText, setVpText] = useState<string>(defaults.viewpoints.join('\n'));
  const [activePreset, setActivePreset] = useState<string>('political_compass');

  const bind =
    <K extends keyof SimConfig>(key: K) =>
      (v: SimConfig[K]) =>
        setCfg((c) => ({ ...c, [key]: v }));

  const applyPreset = (presetId: string) => {
    const p = PRESETS.find(p => p.id === presetId);
    if (!p) return;
    setActivePreset(presetId);
    setCfg((c) => {
      const next: SimConfig = { ...c, ...p.cfg };
      if (p.goal) next.goal = p.goal;
      if (p.viewpoints) {
        next.viewpoints = p.viewpoints;
        setVpText(p.viewpoints.join('\n'));
      }
      return next;
    });
  };

  const start = () => {
    const viewpoints = vpText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    onStart({ ...cfg, viewpoints });
  };

  const presetHint = useMemo(
    () => PRESETS.find(p => p.id === activePreset)?.hint ?? '',
    [activePreset]
  );

  return (
    <div className="bg-slate-900 text-slate-100 p-4 space-y-4 border-l border-slate-800 h-full">
      <h2 className="text-lg font-semibold">Controls</h2>

      {/* Presets */}
      <div className="space-y-2">
        <div className="text-sm font-medium">Presets</div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button
              key={p.id}
              disabled={running}
              onClick={() => applyPreset(p.id)}
              className={[
                "px-3 py-1.5 rounded text-sm border transition",
                activePreset === p.id
                  ? "bg-emerald-600 border-emerald-500"
                  : "bg-slate-800 border-slate-700 hover:bg-slate-700"
              ].join(' ')}
              title={p.hint}
            >
              {p.name}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">{presetHint}</p>
      </div>

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
          placeholder={`Public Safety | humor=light, direction=decider, rigor=data
Individual Rights | humor=dry, direction=explorer, rigor=balanced
Pragmatic Center | direction=wanderer, rigor=balanced`}
        />
        <p className="mt-1 text-[11px] text-slate-400">
          Optional traits: <code>humor=none|light|dry|playful</code>,{' '}
          <code>direction=wanderer|explorer|decider</code>,{' '}
          <code>rigor=anecdotal|balanced|data</code>,{' '}
          <code>naivety=low|med|high</code>, <code>optimism=low|med|high</code>,{' '}
          <code>snark=low|med|high</code>.
        </p>
      </label>

      {/* ───────── Adaptation ───────── */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="col-span-2 font-semibold">Adaptation</div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!cfg.adaptWeights}
            onChange={e => setCfg(v => ({ ...v, adaptWeights: e.target.checked }))}
            disabled={running}
          />
          Per-turn adaptive weights
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!cfg.perAgentWeights}
            onChange={e => setCfg(v => ({ ...v, perAgentWeights: e.target.checked }))}
            disabled={running}
          />
          Start from trait-based profiles
        </label>
        <div className="col-span-2">
          <div className="text-sm">Adapt rate: {(cfg.adaptRate ?? 0).toFixed(2)}</div>
          <input
            type="range" min={0} max={1} step={0.01}
            value={cfg.adaptRate ?? 0}
            onChange={e => setCfg(v => ({ ...v, adaptRate: parseFloat(e.target.value) }))}
            disabled={running}
          />
        </div>
      </div>

      {/* --- Quick knobs --- */}
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          Agents (start)
          <input
            type="number" min={2} max={12}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.agentCount}
            onChange={(e) => bind('agentCount')(parseInt(e.target.value || '0', 10))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Max turns
          <input
            type="number" min={1} max={50}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.maxTurns}
            onChange={(e) => bind('maxTurns')(parseInt(e.target.value || '0', 10))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Context window (msgs)
          <input
            type="number" min={2} max={50}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.maxContextMessages}
            onChange={(e) => bind('maxContextMessages')(parseInt(e.target.value || '0', 10))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Max tokens / reply
          <input
            type="number" min={48} max={400}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.maxTokens}
            onChange={(e) => bind('maxTokens')(parseInt(e.target.value || '0', 10))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Temperature
          <input
            type="number" step="0.05" min={0} max={1.5}
            className="mt-1 w-full bg-slate-800 rounded p-2"
            value={cfg.temperature}
            onChange={(e) => bind('temperature')(parseFloat(e.target.value || '0'))}
            disabled={running}
          />
        </label>

        <label className="block text-sm">
          Turn delay (ms)
          <input
            type="number" min={0} max={3000}
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
