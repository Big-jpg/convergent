// app/api/agents/route.ts
import { openai } from "@ai-sdk/openai";
import { generateText /*, embed*/ } from "ai";

type SimConfig = {
  agentCount: number;
  maxTurns: number;
  maxContextMessages: number;
  maxTokens: number;
  temperature: number;
  joinProb: number;
  leaveProb: number;
  turnDelayMs: number;
  model: "gpt-4o-mini" | "gpt-4o";
  goal: string;

  // Boids
  talkRadius: number;
  perception: number;
  maxSpeed: number;
  alignW: number;
  cohereW: number;
  separateW: number;

  // Dynamics
  activityRate: number; // physics ticks per turn multiplier
  speakRate: number;    // chance each agent in a cluster speaks
  wanderW: number;      // random drift force weight
  speedJitter: number;  // per-agent speed multiplier jitter
};

const COLORS = [
  "#60a5fa", "#34d399", "#f59e0b", "#f472b6", "#a78bfa", "#22d3ee",
  "#fb7185", "#84cc16", "#eab308", "#38bdf8", "#14b8a6", "#f97316"
];

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
function letterId(i: number) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (i < 26) return A[i];
  return A[Math.floor(i / 26) - 1] + A[i % 26];
}
function add(a: [number, number], b: [number, number]) { return [a[0] + b[0], a[1] + b[1]] as [number, number]; }
function sub(a: [number, number], b: [number, number]) { return [a[0] - b[0], a[1] - b[1]] as [number, number]; }
function mul(a: [number, number], s: number) { return [a[0] * s, a[1] * s] as [number, number]; }
function mag(v: [number, number]) { return Math.hypot(v[0], v[1]); }
function setMag(v: [number, number], m: number) { const k = mag(v) || 1e-6; return [v[0] * m / k, v[1] * m / k] as [number, number]; }
function shuffle<T>(arr: T[]) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
function sample<T>(arr: T[]) { return arr[Math.floor(Math.random() * arr.length)]; }

type Persona = {
  stance: "collab" | "skeptic" | "contrarian";
  temp: number;
  styleNote: string;
};

function makePersona(): Persona {
  const r = Math.random();
  if (r < 0.45) return { stance: "collab", temp: 0.5 + Math.random() * 0.2, styleNote: "Build on others, synthesize, propose merges and next steps." };
  if (r < 0.8)  return { stance: "skeptic", temp: 0.6 + Math.random() * 0.2, styleNote: "Probe assumptions, ask hard questions, seek evidence, but stay constructive." };
  return { stance: "contrarian", temp: 0.7 + Math.random() * 0.25, styleNote: "Challenge prevailing view, present alternatives, stress trade-offs and risks." };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const cfg: SimConfig = {
    agentCount: clamp(body?.agentCount ?? body?.config?.agentCount ?? 3, 2, 12),
    maxTurns: clamp(body?.maxTurns ?? body?.config?.maxTurns ?? 6, 1, 50),
    maxContextMessages: clamp(body?.maxContextMessages ?? body?.config?.maxContextMessages ?? 8, 2, 50),
    maxTokens: clamp(body?.maxTokens ?? body?.config?.maxTokens ?? 160, 48, 400),
    temperature: clamp(body?.temperature ?? body?.config?.temperature ?? 0.6, 0, 1.5),
    joinProb: clamp(body?.joinProb ?? body?.config?.joinProb ?? 0.25, 0, 1),
    leaveProb: clamp(body?.leaveProb ?? body?.config?.leaveProb ?? 0.15, 0, 1),
    turnDelayMs: clamp(body?.turnDelayMs ?? body?.config?.turnDelayMs ?? 120, 0, 3000),
    model: (body?.model ?? body?.config?.model ?? "gpt-4o-mini"),
    goal: body?.goal ?? body?.config?.goal ?? "Determine the most sustainable energy source for a lunar research outpost by 2040.",
    talkRadius: clamp(body?.talkRadius ?? 0.28, 0.05, 1),
    perception: clamp(body?.perception ?? 0.45, 0.1, 1.5),
    maxSpeed: clamp(body?.maxSpeed ?? 0.035, 0.005, 0.1),
    alignW: clamp(body?.alignW ?? 0.8, 0, 3),
    cohereW: clamp(body?.cohereW ?? 0.6, 0, 3),
    separateW: clamp(body?.separateW ?? 1.2, 0, 3),
    activityRate: clamp(body?.activityRate ?? 1.4, 0.3, 4),
    speakRate: clamp(body?.speakRate ?? 0.55, 0.1, 1),
    wanderW: clamp(body?.wanderW ?? 0.35, 0, 1.5),
    speedJitter: clamp(body?.speedJitter ?? 0.2, 0, 0.6),
  };

  // Agent pool + personas
  const pool = Array.from({ length: 12 }).map((_, i) => ({
    id: letterId(i),
    name: `Agent ${letterId(i)}`,
    color: COLORS[i % COLORS.length],
    model: openai(cfg.model as any),
    persona: makePersona(),
  }));

  // Per-agent speed multiplier (1 ± jitter)
  const speedMul: Record<string, number> = {};
  for (const a of pool) {
    const j = (Math.random() * 2 - 1) * cfg.speedJitter;
    speedMul[a.id] = Math.max(0.5, 1 + j);
  }

  let active = new Set(pool.slice(0, cfg.agentCount).map(a => a.id));

  // Boids state
  const pos: Record<string, [number, number]> = {};
  const vel: Record<string, [number, number]> = {};
  for (const a of pool) {
    pos[a.id] = [Math.random() * 2 - 1, Math.random() * 2 - 1];
    const angle = Math.random() * Math.PI * 2;
    vel[a.id] = [Math.cos(angle) * cfg.maxSpeed * 0.5, Math.sin(angle) * cfg.maxSpeed * 0.5];
  }

  // “Interest heat” toward recent speakers (decays each physics step)
  const heat: Record<string, number> = {};

  // const EMBED = openai.embedding("text-embedding-3-small"); // keep handy if needed later
  const transcript: Array<{ speaker: string; text: string }> = [];

  // Physics
  function physicsStep(dt = 1) {
    const ids = pool.filter(a => active.has(a.id)).map(a => a.id);

    // decay heat
    for (const k of Object.keys(heat)) heat[k] *= 0.92;

    for (const i of ids) {
      const p = pos[i], v = vel[i];
      let count = 0;
      let avgVel: [number, number] = [0, 0];
      let center: [number, number] = [0, 0];
      let sep: [number, number] = [0, 0];

      for (const j of ids) {
        if (i === j) continue;
        const pj = pos[j];
        const d = Math.hypot(p[0] - pj[0], p[1] - pj[1]);
        if (d < cfg.perception) {
          count++;
          avgVel = add(avgVel, vel[j]);
          center = add(center, pj);
          if (d > 0) sep = add(sep, mul(sub(p, pj), 1 / (d * d)));
        }
      }

      let acc: [number, number] = [0, 0];
      if (count > 0) {
        avgVel = setMag([avgVel[0] / count, avgVel[1] / count], cfg.maxSpeed);
        const align = sub(avgVel, v);

        const centroid = [center[0] / count, center[1] / count] as [number, number];
        const desired = setMag(sub(centroid, p), cfg.maxSpeed);
        const cohere = sub(desired, v);

        const separate = setMag(sep, cfg.maxSpeed);

        acc = add(acc, mul(align, cfg.alignW));
        acc = add(acc, mul(cohere, cfg.cohereW));
        acc = add(acc, mul(separate, cfg.separateW));
      }

      // interest pull toward recent speakers (soft)
      let pull: [number, number] = [0, 0];
      let hsum = 0;
      for (const j of ids) {
        const w = heat[j] || 0;
        if (w <= 0.02 || j === i) continue;
        hsum += w;
        pull = add(pull, mul(sub(pos[j], p), w));
      }
      if (hsum > 0) {
        pull = setMag(pull, Math.min(cfg.maxSpeed * 0.6, 0.025));
        acc = add(acc, pull);
      }

      // wander: small random nudge so no static equilibria
      const theta = Math.random() * Math.PI * 2;
      const wander: [number, number] = [Math.cos(theta), Math.sin(theta)];
      acc = add(acc, mul(setMag(wander, Math.min(cfg.maxSpeed, 0.02)), cfg.wanderW));

      // integrate with per-agent speed cap
      let nv = add(v, mul(acc, dt));
      const limit = cfg.maxSpeed * (speedMul[i] ?? 1);
      const sp = Math.min(mag(nv), limit);
      nv = setMag(nv, sp);
      let np = add(p, nv);

      // wrap
      if (np[0] < -1) np[0] = 1; if (np[0] > 1) np[0] = -1;
      if (np[1] < -1) np[1] = 1; if (np[1] > 1) np[1] = -1;

      vel[i] = nv; pos[i] = np;
    }
  }

  function clusters(): string[][] {
    const ids = pool.filter(a => active.has(a.id)).map(a => a.id);
    const seen = new Set<string>();
    const out: string[][] = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      const q = [id], comp: string[] = [];
      seen.add(id);
      while (q.length) {
        const u = q.pop()!;
        comp.push(u);
        for (const v of ids) {
          if (seen.has(v) || u === v) continue;
          const d = Math.hypot(pos[u][0] - pos[v][0], pos[u][1] - pos[v][1]);
          if (d <= cfg.talkRadius) { seen.add(v); q.push(v); }
        }
      }
      out.push(comp);
    }
    return out;
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: any) =>
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`));

      try {
        send({ type: "start", goal: cfg.goal, config: { ...cfg, model: cfg.model } });
        send({ type: "pos", positions: pos });

        for (let turn = 1; turn <= cfg.maxTurns; turn++) {
          // stochastic join/leave
          if (active.size < pool.length && Math.random() < cfg.joinProb) {
            const inactive = pool.map(a => a.id).filter(id => !active.has(id));
            if (inactive.length) {
              const pick = sample(inactive);
              active.add(pick);
              const a = pool.find(x => x.id === pick)!;
              send({ type: "agent_join", turn, agent: a.id, name: a.name, color: a.color });
            }
          }
          if (active.size > 2 && Math.random() < cfg.leaveProb) {
            const arr = Array.from(active);
            const pick = sample(arr);
            active.delete(pick);
            send({ type: "agent_leave", turn, agent: pick });
          }

          // motion ticks scaled by activityRate
          const ticks = Math.max(8, Math.round(24 * cfg.activityRate));
          for (let s = 0; s < ticks; s++) {
            physicsStep(1);
            if (s % 6 === 0) send({ type: "pos", positions: pos });
          }

          // cluster ordering randomized
          const comps = shuffle(clusters());
          for (const comp of comps) {
            if (!comp.length) continue;

            // probabilistic speakers (never zero, cap at 3 for brevity)
            const candidates = shuffle([...comp]).filter(() => Math.random() < cfg.speakRate);
            const speakers = (candidates.length ? candidates : [sample(comp)]).slice(0, 3);

            for (const agentId of speakers) {
              const agent = pool.find(a => a.id === agentId)!;
              const peerCandidates = comp.filter(id => id !== agentId);
              const targetPeer = peerCandidates.length ? sample(peerCandidates) : undefined;

              // cluster-local recent context
              const ctx = transcript.filter(m => comp.includes(m.speaker)).slice(-cfg.maxContextMessages);
              const persona = agent.persona;

              const system = `
You are ${agent.name}.
Persona: ${persona.stance.toUpperCase()} — ${persona.styleNote}
Style: brief, pointed, <= ${cfg.maxTokens} tokens.
You are participating in a local, proximity-limited group discussion. Respond like a human in a fast roundtable.`.trim();

              const peerHint = targetPeer
                ? `Directly address ${targetPeer} this turn. If you disagree, say why; otherwise merge ideas and propose one next concrete step.`
                : `Make a concise contribution and propose one next concrete step.`;

              const prompt = `
Goal: ${cfg.goal}

Nearby peers you can hear: ${comp.join(", ")}

Recent local context (last ${cfg.maxContextMessages} msgs):
${ctx.map((m, i) => `#${i + 1} ${m.speaker}: ${m.text}`).join("\n")}

Instruction:
- ${peerHint}
- Avoid repetition; add new info or decision.
- If facts conflict, ask one sharp question to resolve.`.trim();

              const result = await generateText({
                model: agent.model,
                temperature: persona.temp ?? cfg.temperature,
                maxOutputTokens: cfg.maxTokens,
                messages: [
                  { role: "system", content: system },
                  { role: "user", content: prompt },
                ],
              });

              const text = result.text.trim();
              transcript.push({ speaker: agent.id, text });

              // Raise “heat” to attract neighbors briefly
              heat[agent.id] = 1.0;

              send({
                type: "agent_message",
                turn,
                agent: agent.id,
                name: agent.name,
                color: agent.color,
                text,
                proj: [pos[agent.id][0], pos[agent.id][1]], // lightweight projection
                active: Array.from(active),
              });

              if (cfg.turnDelayMs > 0) await new Promise(r => setTimeout(r, cfg.turnDelayMs));
            }
          }

          const sizes = comps.map(c => c.length);
          send({
            type: "telemetry",
            turn,
            activeCount: active.size,
            clusters: sizes,
            meanCluster: (sizes.reduce((a, b) => a + b, 0) / (sizes.length || 1))
          });
        }

        send({ type: "done" });
        controller.close();
      } catch (err: any) {
        send({ type: "error", message: err?.message ?? String(err) });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
