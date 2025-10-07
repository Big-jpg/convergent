// app/api/agents/route.ts
import { NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { generateText, embed } from "ai"; // from Vercel AI SDK

const Agents = [
  { id: "A", name: "Agent A", model: openai("gpt-4o"), temperature: 0.5 },
  { id: "B", name: "Agent B", model: openai("gpt-4o"), temperature: 0.7 },
  { id: "C", name: "Agent C", model: openai("gpt-4o"), temperature: 0.6 },
];

const EMBEDDING_MODEL = openai.embedding("text-embedding-3-small");

function cosine(u: number[], v: number[]) {
  let dot = 0, nu = 0, nv = 0;
  for (let i = 0; i < u.length; i++) { dot += u[i]*v[i]; nu += u[i]*u[i]; nv += v[i]*v[i]; }
  return dot / (Math.sqrt(nu) * Math.sqrt(nv));
}

export async function POST(req: Request) {
  const { goal } = await req.json();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: any) => {
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({ type, ...data })}\n\n`)
        );
      };

      try {
        send("start", { goal });

        const transcript: string[] = [];
        const lastVec: Record<string, number[]> = {};

        const maxTurns = 5;
        for (let turn = 1; turn <= maxTurns; turn++) {
          for (const agent of Agents) {
            const prompt = `
You are ${agent.name}. Work towards consensus with two peers.
Goal: ${goal}

Previous messages:
${transcript.map((m, i) => `Step ${i + 1}: ${m}`).join("\n")}

Respond concisely (<=120 tokens), reference peers' points, and propose either:
- a synthesis toward consensus, or
- a specific next question to resolve blocking uncertainty.
`;

            const result = await generateText({
              model: agent.model,
              temperature: agent.temperature,
              messages: [{ role: "user", content: prompt }],
            });

            const text = result.text.trim();
            transcript.push(`${agent.name}: ${text}`);

            // Embed this thought
            const { embedding } = await embed({ model: EMBEDDING_MODEL, value: text });
            lastVec[agent.id] = embedding;

            // Compute pairwise similarity if we have all three
            let avgSim = null;
            if (lastVec["A"] && lastVec["B"] && lastVec["C"]) {
              const ab = cosine(lastVec["A"], lastVec["B"]);
              const ac = cosine(lastVec["A"], lastVec["C"]);
              const bc = cosine(lastVec["B"], lastVec["C"]);
              avgSim = (ab + ac + bc) / 3;
              send("telemetry", {
                turn, agent: agent.id, similarities: { ab, ac, bc, avg: avgSim },
              });
            }

            // Push the agent message + its embedding vector length (to avoid huge payloads)
            send("agent_message", {
              turn,
              agent: agent.id,
              name: agent.name,
              text,
              // for the client, send a tiny projection seed: first 2 dims
              proj: embedding.slice(0, 2),
            });

            // Optional: early stop when highly aligned
            if (avgSim !== null && avgSim > 0.90) {
              send("consensus", { turn, avgSimilarity: avgSim });
              controller.close();
              return;
            }
          }
        }

        send("done", {});
        controller.close();
      } catch (err: any) {
        send("error", { message: err?.message ?? String(err) });
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
