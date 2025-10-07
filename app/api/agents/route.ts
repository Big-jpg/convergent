// app/api/agents/route.ts
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

/** ---------- Config ---------- */
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
  activityRate: number;
  speakRate: number;
  wanderW: number;
  speedJitter: number;

  // Viewpoints & variance
  viewpoints?: ViewCard[];
  tempJitter?: number;

  // --- New: adaptive dynamics ---
  adaptWeights?: boolean;        // enable per-turn adaptation
  adaptRate?: number;            // 0..1 small coefficient (e.g., 0.15)
  perAgentWeights?: boolean;     // start each agent with its own weight profile
};

type Agent = {
  id: string;
  name: string;
  color: string;
  model: any; // underlying model handle from @ai-sdk/openai
  persona: Persona;
  viewpoint?: ViewCard;
};

// Per-agent weight profile (motion + conversational thermals)
type AgentWeights = {
  alignW: number;
  cohereW: number;
  separateW: number;
  wanderW: number;
  tempBias: number;      // additive temperature bias
  stubbornness: number;  // 0..1 (higher = resists convergence)
  volatility: number;    // 0..1 (higher = changes faster)
};

const COLORS = [
  "#60a5fa", "#34d399", "#f59e0b", "#f472b6", "#a78bfa", "#22d3ee",
  "#fb7185", "#84cc16", "#eab308", "#38bdf8", "#14b8a6", "#f97316"
];

/** ---------- Math utils ---------- */
function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
function letterId(i: number) { const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; return i < 26 ? A[i] : A[Math.floor(i / 26) - 1] + A[i % 26]; }
function add(a: [number, number], b: [number, number]) { return [a[0] + b[0], a[1] + b[1]] as [number, number]; }
function sub(a: [number, number], b: [number, number]) { return [a[0] - b[0], a[1] - b[1]] as [number, number]; }
function mul(a: [number, number], s: number) { return [a[0] * s, a[1] * s] as [number, number]; }
function mag(v: [number, number]) { return Math.hypot(v[0], v[1]); }
function setMag(v: [number, number], m: number) { const k = mag(v) || 1e-6; return [v[0] * m / k, v[1] * m / k] as [number, number]; }
function shuffle<T>(arr: T[]) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
function sample<T>(arr: T[]) { return arr[Math.floor(Math.random() * arr.length)]; }
const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

/** ---------- Personas ---------- */
type Persona = { stance: "collab" | "skeptic" | "contrarian"; baseTemp: number; styleNote: string; };
function makePersona(): Persona {
  const r = Math.random();
  if (r < 0.45) return { stance: "collab", baseTemp: 0.55 + Math.random() * 0.2, styleNote: "Build on others, synthesize, propose merges and next steps." };
  if (r < 0.8) return { stance: "skeptic", baseTemp: 0.6 + Math.random() * 0.2, styleNote: "Probe assumptions, ask hard questions, seek evidence; stay constructive." };
  return { stance: "contrarian", baseTemp: 0.75 + Math.random() * 0.25, styleNote: "Challenge prevailing views; highlight trade-offs and risks." };
}

type VoiceTraits = {
  humor?: "none" | "light" | "dry" | "playful";
  naivety?: "low" | "med" | "high";
  direction?: "wanderer" | "explorer" | "decider";
  rigor?: "anecdotal" | "balanced" | "data";
  optimism?: "low" | "med" | "high";
  snark?: "low" | "med" | "high";
};

type ViewCard = { label: string; desc?: string; traits: VoiceTraits };

function parseViewpoints(raw: unknown): ViewCard[] {
  const lines: string[] =
    Array.isArray(raw) ? raw.map(String)
    : typeof raw === "string" ? raw.split(/\r?\n|,/) : [];
  const out: ViewCard[] = [];
  for (const line0 of lines) {
    const line = String(line0).trim();
    if (!line) continue;
    const [lhs, rhs] = line.split("|").map(s => s.trim());
    const labelDesc = lhs.split(" - ");
    const label = labelDesc[0]?.trim() || "Viewpoint";
    const desc = labelDesc.slice(1).join(" - ").trim() || undefined;

    const traits: VoiceTraits = {};
    if (rhs) {
      for (const kv of rhs.split(",")) {
        const [k0, v0] = kv.split("=").map(s => s.trim().toLowerCase());
        if (!k0 || !v0) continue;
        if (k0 === "humor" && ["none", "light", "dry", "playful"].includes(v0)) traits.humor = v0 as VoiceTraits["humor"];
        if (["naivety", "naive"].includes(k0) && ["low", "med", "high"].includes(v0)) traits.naivety = v0 as VoiceTraits["naivety"];
        if (k0 === "direction" && ["wanderer", "explorer", "decider"].includes(v0)) traits.direction = v0 as VoiceTraits["direction"];
        if (k0 === "rigor" && ["anecdotal", "balanced", "data", "data-heavy"].includes(v0)) traits.rigor = (v0 === "data-heavy" ? "data" : v0) as VoiceTraits["rigor"];
        if (k0 === "optimism" && ["low", "med", "high"].includes(v0)) traits.optimism = v0 as VoiceTraits["optimism"];
        if (k0 === "snark" && ["low", "med", "high"].includes(v0)) traits.snark = v0 as VoiceTraits["snark"];
      }
    }
    out.push({ label, desc, traits });
  }
  return out;
}

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

function weightsFromTraits(tr: VoiceTraits): AgentWeights {
  // defaults (balanced)
  let alignW = 0.8, cohereW = 0.7, separateW = 1.0, wanderW = 0.45, tempBias = 0.0;
  let stubbornness = 0.5, volatility = 0.5;

  switch (tr.direction) {
    case "decider":    alignW = 0.9; cohereW = 0.6; separateW = 1.35; stubbornness = 0.8; volatility = 0.2; break;
    case "explorer":   alignW = 0.6; cohereW = 0.85; separateW = 1.0;  stubbornness = 0.4; volatility = 0.7; break;
    case "wanderer":   alignW = 0.7; cohereW = 0.7;  separateW = 0.95; stubbornness = 0.3; volatility = 0.8; wanderW = 0.6; break;
    default: break;
  }
  if (tr.rigor === "data")      { alignW += 0.05; separateW += 0.05; }
  if (tr.humor === "playful")   { tempBias += 0.05; }
  if (tr.humor === "dry")       { tempBias += 0.02; }

  return {
    alignW, cohereW, separateW, wanderW,
    tempBias,
    stubbornness: clamp01(stubbornness),
    volatility: clamp01(volatility),
  };
}

/** ---------- Topic anchoring helpers ---------- */
const STOPWORDS = new Set([
  "the","a","an","to","and","or","for","of","in","by","on","with","at","as","is","are","be","was","were","that","this","these","those","from","about","into","over","under","vs","versus","within","out","up","down","how","what","when","where","why","which"
]);

function anchorsFromGoal(goal: string, n = 6): string[] {
  const words = goal
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w));
  const uniq: string[] = [];
  for (const w of words) if (!uniq.includes(w)) uniq.push(w);
  return uniq.slice(0, n);
}

/** ---------- Conversation moves ---------- */
const MOVES = [
  "ASK", "CHALLENGE", "BUILD", "STORY", "ANALOGY", "DATA_POINT", "SYNTHESIZE", "DECIDE"
] as const;
type Move = typeof MOVES[number];

function weightByTraits(tr: VoiceTraits): Record<Move, number> {
  const w: Record<Move, number> = {
    ASK: 1, CHALLENGE: 1, BUILD: 1, STORY: 0.6, ANALOGY: 0.6, DATA_POINT: 0.6, SYNTHESIZE: 0.8, DECIDE: 0.6
  };
  if (tr.naivety === "high") { w.ASK += 0.8; w.ANALOGY += 0.3; }
  if (tr.direction === "explorer") { w.ASK += 0.4; w.BUILD += 0.2; }
  if (tr.direction === "decider") { w.DECIDE += 0.8; w.SYNTHESIZE += 0.4; }
  if (tr.rigor === "data") { w.DATA_POINT += 1.0; }
  if (tr.rigor === "anecdotal") { w.STORY += 0.6; }
  if (tr.humor === "playful" || tr.humor === "dry") { w.STORY += 0.2; w.ANALOGY += 0.2; }
  return w;
}
function pickMove(tr: VoiceTraits): Move {
  const w = weightByTraits(tr);
  const sum = (Object.values(w) as number[]).reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (const m of MOVES) { r -= w[m]; if (r <= 0) return m; }
  return "BUILD";
}

/** ---------- Main handler ---------- */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const cfg: SimConfig = {
    agentCount: clamp(body?.agentCount ?? 3, 2, 12),
    maxTurns: clamp(body?.maxTurns ?? 6, 1, 50),
    maxContextMessages: clamp(body?.maxContextMessages ?? 8, 2, 50),
    maxTokens: clamp(body?.maxTokens ?? 160, 48, 400),
    temperature: clamp(body?.temperature ?? 0.6, 0, 1.5),
    joinProb: clamp(body?.joinProb ?? 0.25, 0, 1),
    leaveProb: clamp(body?.leaveProb ?? 0.15, 0, 1),
    turnDelayMs: clamp(body?.turnDelayMs ?? 120, 0, 3000),
    model: (body?.model ?? "gpt-4o-mini"),
    goal: body?.goal ?? "Determine the most sustainable energy source for a lunar outpost by 2040.",
    talkRadius: clamp(body?.talkRadius ?? 0.28, 0.05, 1),
    perception: clamp(body?.perception ?? 0.45, 0.1, 1.5),
    maxSpeed: clamp(body?.maxSpeed ?? 0.035, 0.005, 0.1),
    alignW: clamp(body?.alignW ?? 0.8, 0, 3),
    cohereW: clamp(body?.cohereW ?? 0.6, 0, 3),
    separateW: clamp(body?.separateW ?? 1.2, 0, 3),
    activityRate: clamp(body?.activityRate ?? 1.6, 0.3, 4),
    speakRate: clamp(body?.speakRate ?? 0.6, 0.1, 1),
    wanderW: clamp(body?.wanderW ?? 0.45, 0, 1.5),
    speedJitter: clamp(body?.speedJitter ?? 0.3, 0, 0.6),
    viewpoints: parseViewpoints(body?.viewpoints ?? []),
    tempJitter: clamp(body?.tempJitter ?? 0.2, 0, 0.8),
    adaptWeights: !!(body?.adaptWeights ?? true),
    adaptRate: clamp(body?.adaptRate ?? 0.15, 0, 1),
    perAgentWeights: !!(body?.perAgentWeights ?? true),
  };

  // compute anchor terms from goal
  const anchors = anchorsFromGoal(cfg.goal);

  // Agent pool
  const pool: Agent[] = Array.from({ length: 12 }).map((_, i) => {
    const persona = makePersona();
    const vp = cfg.viewpoints && cfg.viewpoints.length > 0 ? sample(cfg.viewpoints) : undefined;
    return {
      id: letterId(i),
      name: `Agent ${letterId(i)}`,
      color: COLORS[i % COLORS.length],
      model: openai(cfg.model as any),
      persona,
      viewpoint: vp,
    };
  });

  // Per-agent dynamic weights (either derived from traits or start from globals)
  const dyn: Record<string, AgentWeights> = {};
  for (const a of pool) {
    if (cfg.perAgentWeights) {
      dyn[a.id] = weightsFromTraits(a.viewpoint?.traits ?? {});
    } else {
      dyn[a.id] = {
        alignW: cfg.alignW, cohereW: cfg.cohereW, separateW: cfg.separateW,
        wanderW: cfg.wanderW, tempBias: 0,
        stubbornness: 0.5, volatility: 0.5,
      };
    }
  }

  // Per-agent speed cap jitter
  const speedMul: Record<string, number> = {};
  for (const a of pool) {
    const j = (Math.random() * 2 - 1) * cfg.speedJitter;
    speedMul[a.id] = Math.max(0.5, 1 + j);
  }

  // Speak bias by traits (deciders talk more, wanderers less)
  const speakBias: Record<string, number> = {};
  for (const a of pool) {
    const tr = a.viewpoint?.traits ?? {};
    let bias = 0;
    if (tr.direction === "decider") bias += 0.15;
    if (tr.direction === "wanderer") bias -= 0.1;
    if (tr.humor === "playful") bias += 0.05;
    speakBias[a.id] = bias;
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

  // Interest heat
  const heat: Record<string, number> = {};
  const transcript: Array<{ speaker: string; text: string }> = [];

  function physicsStep(dt = 1) {
    const ids = pool.filter(a => active.has(a.id)).map(a => a.id);
    for (const k of Object.keys(heat)) heat[k] *= 0.92;

    for (const i of ids) {
      const p = pos[i], v = vel[i];
      const w = dyn[i];
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
        const align = sub(setMag([avgVel[0] / count, avgVel[1] / count], cfg.maxSpeed), v);
        const centroid = [center[0] / count, center[1] / count] as [number, number];
        const cohere = sub(setMag(sub(centroid, p), cfg.maxSpeed), v);
        const separate = setMag(sep, cfg.maxSpeed);

        acc = add(acc, mul(align, w.alignW));
        acc = add(acc, mul(cohere, w.cohereW));
        acc = add(acc, mul(separate, w.separateW));
      }

      // interest pull
      let pull: [number, number] = [0, 0]; let hsum = 0;
      for (const j of ids) {
        const wh = heat[j] || 0; if (wh <= 0.02 || j === i) continue;
        hsum += wh; pull = add(pull, mul(sub(pos[j], p), wh));
      }
      if (hsum > 0) acc = add(acc, setMag(pull, Math.min(cfg.maxSpeed * 0.6, 0.025)));

      // wander (per-agent)
      const theta = Math.random() * Math.PI * 2;
      acc = add(acc, mul(setMag([Math.cos(theta), Math.sin(theta)], Math.min(cfg.maxSpeed, 0.02)), w.wanderW));

      // integrate with per-agent cap
      let nv = add(v, mul(acc, dt));
      const limit = cfg.maxSpeed * (speedMul[i] ?? 1);
      nv = setMag(nv, Math.min(mag(nv), limit));
      let np = add(p, nv);

      if (np[0] < -1) np[0] = 1; if (np[0] > 1) np[0] = -1;
      if (np[1] < -1) np[1] = 1; if (np[1] > 1) np[1] = -1;

      vel[i] = nv; pos[i] = np;
    }
  }

  function clusters(): string[][] {
    const ids = pool.filter(a => active.has(a.id)).map(a => a.id);
    const seen = new Set<string>(); const out: string[][] = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      const q = [id], comp: string[] = []; seen.add(id);
      while (q.length) {
        const u = q.pop()!; comp.push(u);
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

  const CONSENSUS_THRESH = 0.6;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: any) =>
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`));

      try {
        send({ type: "start", goal: cfg.goal, config: { ...cfg, model: cfg.model } });
        send({ type: "pos", positions: pos });

        for (let turn = 1; turn <= cfg.maxTurns; turn++) {
          // join/leave
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
            const pick = sample(Array.from(active));
            active.delete(pick);
            send({ type: "agent_leave", turn, agent: pick });
          }

          // motion (scaled by activityRate)
          const ticks = Math.max(8, Math.round(24 * cfg.activityRate));
          for (let s = 0; s < ticks; s++) {
            physicsStep(1);
            if (s % 6 === 0) send({ type: "pos", positions: pos });
          }

          // clusters randomized
          const comps = shuffle(clusters());
          const consensusOut: Array<{ size: number; support: number; proposal: string }> = [];

          for (const comp of comps) {
            if (!comp.length) continue;

            // probabilistic speakers with per-agent bias (never zero, cap 3)
            const candidates = shuffle([...comp]).filter(id => {
              const bias = speakBias[id] ?? 0;
              const p = clamp(cfg.speakRate + bias, 0.05, 0.95);
              return Math.random() < p;
            });
            const speakers = (candidates.length ? candidates : [sample(comp)]).slice(0, 3);

            type Vote = { stance: number; proposal: string };
            const votes: Vote[] = [];

            for (const agentId of speakers) {
              const agent: Agent = pool.find(a => a.id === agentId)!;
              const peerCandidates = comp.filter(id => id !== agentId);
              const targetPeer = peerCandidates.length ? sample(peerCandidates) : undefined;
              const ctx = transcript.filter(m => comp.includes(m.speaker)).slice(-cfg.maxContextMessages);

              const { stance: personaStance, baseTemp, styleNote } = agent.persona;
              const tRand = (cfg.tempJitter ?? 0.2) * (Math.random() * 2 - 1);
              const tr = agent.viewpoint?.traits ?? {};
              const humorKick = tr.humor === "playful" ? 0.05 : tr.humor === "dry" ? 0.02 : 0;
              const effTemp = clamp(baseTemp + (dyn[agent.id]?.tempBias ?? 0) + tRand + humorKick, 0, 1.5);

              const move = pickMove(tr);

              const system = `
              You are ${agent.name}.
              Persona: ${personaStance.toUpperCase()} — ${styleNote}
              Viewpoint: ${agent.viewpoint?.label ?? "None"}${agent.viewpoint?.desc ? " — " + agent.viewpoint?.desc : ""}

              TOPIC (do not restate verbatim): ${cfg.goal}
              ANCHOR TERMS: ${anchors.join(", ")}

              VOICE TRAITS
              - Humor: ${tr.humor ?? "none"}${tr.humor && tr.humor!=="none" ? " (one **very** short aside allowed occasionally)" : ""}
              - Naivety: ${tr.naivety ?? "med"}
              - Direction: ${tr.direction ?? "explorer"}
              - Rigor: ${tr.rigor ?? "balanced"}
              - Optimism: ${tr.optimism ?? "med"}
              - Snark: ${tr.snark ?? "low"}

              TOPIC RULES
              - Stay tightly scoped to the TOPIC. Every point must connect back to it.
              - Use at least one ANCHOR TERM when you make a claim or propose a step.
              - Keep it brief (<= ${cfg.maxTokens} tokens). Use 1–2 short paragraphs or a compact list.
              `.trim();

              const moveGuide =
                move === "ASK" ? "Ask one sharp question and say why it matters."
                  : move === "CHALLENGE" ? "Challenge a specific claim; be civil; give one reason or counterexample."
                    : move === "BUILD" ? "Build directly on a peer's idea and add one improvement."
                      : move === "STORY" ? "1–2 sentence anecdote illustrating the trade-off."
                        : move === "ANALOGY" ? "Short analogy that clarifies the choice."
                          : move === "DATA_POINT" ? "Bring one concrete datum and how it changes the decision."
                            : move === "SYNTHESIZE" ? "Summarize 2–3 points and highlight the crux."
                              : "Propose one actionable next step or decision with justification.";

              const peerHint = targetPeer
                ? `Directly address ${targetPeer} in one sentence.`
                : `Address the cluster concisely.`;

              const prompt = `
              Cluster peers you can hear: ${comp.join(", ")}

              Recent local context (last ${cfg.maxContextMessages} msgs):
              ${ctx.map((m, i) => `#${i + 1} ${m.speaker}: ${m.text}`).join("\n")}

              MOVE: ${move}. Guidance: ${moveGuide}. ${peerHint}

              At the very end, append a single meta tag of the form:
              <META stance={-1|0|+1} proposal="very short title of the step you support or '' if none">
              `.trim();

              const result = await generateText({
                model: agent.model,
                temperature: effTemp,
                maxOutputTokens: cfg.maxTokens,
                messages: [
                  { role: "system", content: system },
                  { role: "user", content: prompt },
                ],
              });

              const text = result.text.trim();
              // Parse <META stance=... proposal="...">
              let voteStance = 0;
              let proposal = "";
              const m = text.match(/<META\s+stance\s*=\s*([+\-]?\d)\s+proposal\s*=\s*"([^"]*)"\s*>/i);
              if (m) {
                voteStance = Math.max(-1, Math.min(1, parseInt(m[1], 10) || 0));
                proposal = (m[2] || "").slice(0, 120).trim();
              }
              const textClean = text.replace(/<META[^>]*>/gi, "").trim();

              transcript.push({ speaker: agent.id, text: textClean });
              heat[agent.id] = 1.0;

              votes.push({ stance: voteStance, proposal });

              send({
                type: "agent_message",
                turn,
                agent: agent.id,
                name: agent.name,
                color: agent.color,
                text: textClean,
                proj: [pos[agent.id][0], pos[agent.id][1]],
                active: Array.from(active),
                vpLabel: agent.viewpoint?.label ?? null,
                stance: voteStance,
                proposal,
              });

              if (cfg.turnDelayMs > 0) await new Promise(r => setTimeout(r, cfg.turnDelayMs));
            } // end speakers

            // ---- cluster consensus from votes ----
            const byProp: Record<string, { yes: number; total: number }> = {};
            for (const v of votes) {
              if (!v.proposal) continue;
              const k = normalize(v.proposal);
              byProp[k] ??= { yes: 0, total: 0 };
              if (v.stance !== 0) byProp[k].total++;
              if (v.stance > 0) byProp[k].yes++;
            }
            let bestK = ""; let best = { yes: 0, total: 0 };
            for (const [k, v] of Object.entries(byProp)) {
              if (v.yes > best.yes) { bestK = k; best = v; }
            }
            if (best.total > 0) {
              const support = best.yes / best.total;
              if (support >= CONSENSUS_THRESH) {
                consensusOut.push({ size: comp.length, support, proposal: bestK });
              }
            }

            // --- Adaptive drift: nudge weights of speakers in this cluster
            if (cfg.adaptWeights && votes.length) {
              for (let idx = 0; idx < speakers.length; idx++) {
                const agentId = speakers[idx];
                const agentW = dyn[agentId];
                if (!agentW) continue;
                const v = votes[idx];

                // Determine agreement with winning proposal (if any)
                const winner = bestK;
                const agrees = winner && v.proposal && normalize(v.proposal) === winner && v.stance > 0;
                const disagrees = winner && v.stance < 0 && normalize(v.proposal) === winner;

                const rate = cfg.adaptRate! * (agrees || disagrees ? 1 : 0.5);
                const resist = 1 - agentW.stubbornness;
                const step = rate * (agentW.volatility * 0.6 + 0.4) * resist;

                if (agrees) {
                  agentW.alignW = clamp(agentW.alignW + 0.20 * step, 0, 3);
                  agentW.cohereW = clamp(agentW.cohereW + 0.18 * step, 0, 3);
                  agentW.separateW = clamp(agentW.separateW - 0.22 * step, 0, 3);
                  agentW.wanderW  = clamp(agentW.wanderW  - 0.10 * step, 0, 1.5);
                  agentW.tempBias = clamp(agentW.tempBias - 0.04 * step, -0.4, 0.6);
                } else if (disagrees) {
                  agentW.alignW = clamp(agentW.alignW - 0.12 * step, 0, 3);
                  agentW.cohereW = clamp(agentW.cohereW - 0.10 * step, 0, 3);
                  agentW.separateW = clamp(agentW.separateW + 0.25 * step, 0, 3);
                  agentW.wanderW  = clamp(agentW.wanderW  + 0.12 * step, 0, 1.5);
                  agentW.tempBias = clamp(agentW.tempBias + 0.05 * step, -0.4, 0.6);
                } else {
                  // Neutral: small homeostatic drift toward global cfg.
                  agentW.alignW += (cfg.alignW - agentW.alignW) * 0.05 * rate;
                  agentW.cohereW += (cfg.cohereW - agentW.cohereW) * 0.05 * rate;
                  agentW.separateW += (cfg.separateW - agentW.separateW) * 0.05 * rate;
                }
              }
            }
          } // end comps

          const sizes = comps.map(c => c.length);
          send({
            type: "telemetry",
            turn,
            activeCount: active.size,
            clusters: sizes,
            meanCluster: (sizes.reduce((a, b) => a + b, 0) / (sizes.length || 1)),
            consensus: consensusOut,
          });
        } // end turns

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
