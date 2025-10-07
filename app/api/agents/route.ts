// app/api/agents/route.ts
import { openai } from "@ai-sdk/openai";
import { generateText, embed } from "ai";
import { NextResponse } from "next/server";

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
};

const COLORS = [
  "#60a5fa", "#34d399", "#f59e0b", "#f472b6", "#a78bfa", "#22d3ee",
  "#fb7185", "#84cc16", "#eab308", "#38bdf8", "#14b8a6", "#f97316",
];

function cosine(u: number[], v: number[]) {
  let dot = 0, nu = 0, nv = 0;
  for (let i = 0; i < u.length; i++) { dot += u[i] * v[i]; nu += u[i] * u[i]; nv += v[i] * v[i]; }
  return dot / (Math.sqrt(nu) * Math.sqrt(nv));
}

function letterId(i: number) {
  // A, B, C, ... Z, AA, AB ... (enough for our 12-agent cap)
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (i < 26) return alphabet[i];
  return alphabet[Math.floor(i / 26) - 1] + alphabet[i % 26];
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const cfg: SimConfig = {
    agentCount: Math.min(Math.max(2, body?.agentCount ?? body?.config?.agentCount ?? 3), 12),
    maxTurns: Math.min(Math.max(1, body?.maxTurns ?? body?.config?.maxTurns ?? 6), 50),
    maxContextMessages: Math.min(Math.max(2, body?.maxContextMessages ?? body?.config?.maxContextMessages ?? 8), 50),
    maxTokens: Math.min(Math.max(48, body?.maxTokens ?? body?.config?.maxTokens ?? 160), 400),
    temperature: Math.min(Math.max(0, body?.temperature ?? body?.config?.temperature ?? 0.6), 1.5),
    joinProb: Math.min(Math.max(0, body?.joinProb ?? body?.config?.joinProb ?? 0.25), 1),
    leaveProb: Math.min(Math.max(0, body?.leaveProb ?? body?.config?.leaveProb ?? 0.15), 1),
    turnDelayMs: Math.min(Math.max(0, body?.turnDelayMs ?? body?.config?.turnDelayMs ?? 200), 3000),
    model: (body?.model ?? body?.config?.model ?? "gpt-4o-mini") as SimConfig["model"],
    goal:
      body?.goal ??
      body?.config?.goal ??
      "Determine the most sustainable energy source for a lunar research outpost by 2040.",
  };

  // Build a pool of up to 12 agents
  const pool = Array.from({ length: 12 }).map((_, i) => ({
    id: letterId(i),            // "A", "B", ...
    name: `Agent ${letterId(i)}`,
    color: COLORS[i % COLORS.length],
    model: openai(cfg.model),   // speed-first default; still overridable later
  }));

  // Active set (first N)
  let active = new Set(pool.slice(0, cfg.agentCount).map((a) => a.id));

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: any) =>
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`));

      try {
        send({ type: "start", goal: cfg.goal, config: { ...cfg, model: cfg.model } });

        const transcript: Array<{ speaker: string; text: string }> = [];
        const lastVec: Record<string, number[]> = {};

        const EMBED = openai.embedding("text-embedding-3-small");

        for (let turn = 1; turn <= cfg.maxTurns; turn++) {
          // probabilistic join/leave (nuance emerges here)
          // join: if space available and roll passes
          if (active.size < pool.length && Math.random() < cfg.joinProb) {
            const inactive = pool.map((a) => a.id).filter((id) => !active.has(id));
            if (inactive.length > 0) {
              const pick = inactive[Math.floor(Math.random() * inactive.length)];
              active.add(pick);
              const a = pool.find((x) => x.id === pick)!;
              send({ type: "agent_join", turn, agent: a.id, name: a.name, color: a.color });
            }
          }
          // leave: keep at least 2 agents active
          if (active.size > 2 && Math.random() < cfg.leaveProb) {
            const arr = Array.from(active);
            const pick = arr[Math.floor(Math.random() * arr.length)];
            active.delete(pick);
            send({ type: "agent_leave", turn, agent: pick });
          }

          // Round-robin over current active set (stable order by id)
          const roster = pool.filter((a) => active.has(a.id));

          for (const agent of roster) {
            const ctx = transcript.slice(-cfg.maxContextMessages); // short memory
            const prompt = `
You are ${agent.name}.
Goal: ${cfg.goal}

Prior (last ${cfg.maxContextMessages} msgs max):
${ctx.map((m, i) => `#${i + 1} ${m.speaker}: ${m.text}`).join("\n")}

Rules:
- Be brief and decisive (<= ${cfg.maxTokens} tokens).
- Reference peers where relevant.
- Either synthesize agreement OR ask the single next resolving question.
- Avoid repetition. New info only.
`;

            const result = await generateText({
              model: agent.model,
              temperature: cfg.temperature,
              maxOutputTokens: cfg.maxTokens, 
              messages: [{ role: "user", content: prompt }],
            });

            const text = result.text.trim();
            transcript.push({ speaker: agent.id, text });

            // Embed this thought
            const { embedding } = await embed({ model: EMBED, value: text });
            lastVec[agent.id] = embedding;

            // Compute pairwise similarity on current active set
            const actIds = roster.map((r) => r.id);
            let sum = 0;
            let pairs = 0;
            for (let i = 0; i < actIds.length; i++) {
              for (let j = i + 1; j < actIds.length; j++) {
                const si = lastVec[actIds[i]];
                const sj = lastVec[actIds[j]];
                if (si && sj) {
                  sum += cosine(si, sj);
                  pairs++;
                }
              }
            }
            const avg = pairs > 0 ? sum / pairs : 0;

            // Stream message
            send({
              type: "agent_message",
              turn,
              agent: agent.id,
              name: agent.name,
              color: agent.color,
              text,
              proj: embedding.slice(0, 2), // tiny projection for client viz
              active: Array.from(active),
            });

            // Telemetry
            send({
              type: "telemetry",
              turn,
              activeCount: active.size,
              avgSimilarity: avg,
            });

            if (cfg.turnDelayMs > 0) {
              await new Promise((r) => setTimeout(r, cfg.turnDelayMs));
            }
          }
        }

        send({ type: "done" });
        controller.close();
      } catch (err: any) {
        send({ type: "error", message: err?.message ?? String(err) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
