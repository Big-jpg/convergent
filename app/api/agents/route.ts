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
};

type Agent = {
  id: string;
  name: string;
  color: string;
  model: any; // Consider refining this type if possible
  persona: Persona;
  viewpoint?: ViewCard;
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
function shuffle<T>(arr: T[]) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
function sample<T>(arr: T[]) { return arr[Math.floor(Math.random() * arr.length)]; }

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
    Array.isArray(raw) ? raw.map(String) :
      typeof raw === "string" ? raw.split(/\r?\n|,/) :
        [];
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
    agentCount: clamp(body?.agentCount ?? body?.config?.agentCount ?? 3, 2, 12),
    maxTurns: clamp(body?.maxTurns ?? body?.config?.maxTurns ?? 6, 1, 50),
    maxContextMessages: clamp(body?.maxContextMessages ?? body?.config?.maxContextMessages ?? 8, 2, 50),
    maxTokens: clamp(body?.maxTokens ?? body?.config?.maxTokens ?? 160, 48, 400),
    temperature: clamp(body?.temperature ?? body?.config?.temperature ?? 0.6, 0, 1.5),
    joinProb: clamp(body?.joinProb ?? body?.config?.joinProb ?? 0.25, 0, 1),
    leaveProb: clamp(body?.leaveProb ?? body?.config?.leaveProb ?? 0.15, 0, 1),
    turnDelayMs: clamp(body?.turnDelayMs ?? body?.config?.turnDelayMs ?? 120, 0, 3000),
    model: (body?.model ?? body?.config?.model ?? "gpt-4o-mini"),
    goal: body?.goal ?? body?.config?.goal ?? "Determine the most sustainable energy source for a lunar outpost by 2040.",
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
    viewpoints: parseViewpoints(body?.viewpoints ?? body?.config?.viewpoints ?? []),
    tempJitter: clamp(body?.tempJitter ?? 0.2, 0, 0.8),
  };

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

        acc = add(acc, mul(align, cfg.alignW));
        acc = add(acc, mul(cohere, cfg.cohereW));
        acc = add(acc, mul(separate, cfg.separateW));
      }

      // interest pull
      let pull: [number, number] = [0, 0]; let hsum = 0;
      for (const j of ids) {
        const w = heat[j] || 0; if (w <= 0.02 || j === i) continue;
        hsum += w; pull = add(pull, mul(sub(pos[j], p), w));
      }
      if (hsum > 0) acc = add(acc, setMag(pull, Math.min(cfg.maxSpeed * 0.6, 0.025)));

      // wander
      const theta = Math.random() * Math.PI * 2;
      acc = add(acc, mul(setMag([Math.cos(theta), Math.sin(theta)], Math.min(cfg.maxSpeed, 0.02)), cfg.wanderW));

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
          for (const comp of comps) {
            if (!comp.length) continue;

            // probabilistic speakers with per-agent bias (never zero, cap 3)
            const candidates = shuffle([...comp]).filter(id => {
              const bias = speakBias[id] ?? 0;
              const p = clamp(cfg.speakRate + bias, 0.05, 0.95);
              return Math.random() < p;
            });
            const speakers = (candidates.length ? candidates : [sample(comp)]).slice(0, 3);

            for (const agentId of speakers) {
              const agent: Agent = pool.find(a => a.id === agentId)!;
              const peerCandidates = comp.filter(id => id !== agentId);
              const targetPeer = peerCandidates.length ? sample(peerCandidates) : undefined;
              const ctx = transcript.filter(m => comp.includes(m.speaker)).slice(-cfg.maxContextMessages);

              const { stance, baseTemp, styleNote } = agent.persona;
              const tRand = (cfg.tempJitter ?? 0.2) * (Math.random() * 2 - 1);
              const tr = agent.viewpoint?.traits ?? {};
              const humorKick = tr.humor === "playful" ? 0.05 : tr.humor === "dry" ? 0.02 : 0;
              const effTemp = clamp(baseTemp + tRand + humorKick, 0, 1.5);

              const move = pickMove(tr);

              const system = `
    You are ${agent.name}.
    Persona: ${stance.toUpperCase()} — ${styleNote}
    Viewpoint: ${agent.viewpoint?.label ?? "None"}${agent.viewpoint?.desc ? " — " + agent.viewpoint?.desc : ""}

    VOICE TRAITS
    - Humor: ${tr.humor ?? "none"}${tr.humor && tr.humor !== "none" ? " (one **very short** witty aside allowed occasionally)" : ""}
    - Naivety: ${tr.naivety ?? "med"}
    - Direction: ${tr.direction ?? "explorer"}
    - Rigor: ${tr.rigor ?? "balanced"}
    - Optimism: ${tr.optimism ?? "med"}
    - Snark: ${tr.snark ?? "low"}

    Obey the selected conversational MOVE this turn: **${move}**.
    Keep replies tight (<= ${cfg.maxTokens} tokens). Avoid wall-of-text. Use one or two short paragraphs or a compact list.
  `.trim();

              const moveGuide =
                move === "ASK" ? "Ask one sharp question that moves the discussion forward; include a brief reason why it matters."
                  : move === "CHALLENGE" ? "Challenge a specific claim nearby. Be precise and civil; give one reason or counterexample."
                    : move === "BUILD" ? "Build directly on a peer's idea, merging it with your viewpoint. Add one incremental improvement."
                      : move === "STORY" ? "Share a tiny (1–2 sentence) anecdote illustrating the trade-off; keep it concrete."
                        : move === "ANALOGY" ? "Offer a short analogy/metaphor that clarifies the choice; keep it fresh, not cliché."
                          : move === "DATA_POINT" ? "Bring one concrete datum (approximate is fine) and say how it changes the decision."
                            : move === "SYNTHESIZE" ? "Summarize 2–3 key points from the cluster and highlight the crux."
                              : "Propose one **actionable next step** or decision with a clear justification.";

              const peerHint = targetPeer
                ? `Directly address **${targetPeer}** in one sentence.`
                : `Address the cluster concisely.`;

              const prompt = `
                Goal: ${cfg.goal}

                Nearby peers you can hear: ${comp.join(", ")}

                Recent local context (last ${cfg.maxContextMessages} msgs):
                ${ctx.map((m, i) => `#${i + 1} ${m.speaker}: ${m.text}`).join("\n")}

                MOVE to perform: ${move}.
                Guidance: ${moveGuide}
                ${peerHint}

                Rules:
                - Add **substance**: include at least one of {claim, reason, example, datum, concrete next step}.
                - If you change your mind, admit it briefly.
                - Avoid repeating prior text; be incremental.
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
              transcript.push({ speaker: agent.id, text });
              heat[agent.id] = 1.0;

              send({
                type: "agent_message",
                turn,
                agent: agent.id,
                name: agent.name,
                color: agent.color,
                text,
                proj: [pos[agent.id][0], pos[agent.id][1]],
                active: Array.from(active),
              });

              if (cfg.turnDelayMs > 0) await new Promise(r => setTimeout(r, cfg.turnDelayMs));
            }
          }

          const sizes = comps.map(c => c.length);
          send({ type: "telemetry", turn, activeCount: active.size, clusters: sizes, meanCluster: (sizes.reduce((a, b) => a + b, 0) / (sizes.length || 1)) });
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
