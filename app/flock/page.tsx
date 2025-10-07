// app/flock/page.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import BoidCanvas from "@/components/BoidCanvas";
import ChatLog from "@/components/ChatLog";
import AgentStatusCard from "@/components/AgentStatusCard";

type EventPayload =
  | { type: "start"; goal: string }
  | { type: "agent_message"; turn: number; agent: "A" | "B" | "C"; name: string; text: string; proj: number[] }
  | { type: "telemetry"; turn: number; agent: string; similarities: { ab: number; ac: number; bc: number; avg: number } }
  | { type: "consensus"; turn: number; avgSimilarity: number }
  | { type: "done" }
  | { type: "error"; message: string };

export default function FlockPage() {
  const [messages, setMessages] = useState<Array<{ agent: string; text: string; turn: number }>>([]);
  const [positions, setPositions] = useState<Record<string, [number, number]>>({
    A: [Math.random(), Math.random()],
    B: [Math.random(), Math.random()],
    C: [Math.random(), Math.random()],
  });
  const [avgSim, setAvgSim] = useState(0);
  const [status, setStatus] = useState("Waiting for agents to start conversation...");
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setStatus("Starting…");
      const res = await fetch("/api/agents", {
        method: "POST",
        body: JSON.stringify({ goal: "Determine the most sustainable energy source for a lunar research outpost by 2040." }),
      });

      if (!res.body) { setStatus("No stream"); return; }
      readerRef.current = res.body.getReader();
      const decoder = new TextDecoder();

      while (!cancelled) {
        const { value, done } = await readerRef.current.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        // SSE: multiple "data: ..." lines can arrive per chunk
        for (const line of chunk.split("\n\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const json = trimmed.slice(5).trim();
          if (!json) continue;
          const evt = JSON.parse(json) as EventPayload;

          if (evt.type === "start") setStatus("Agents thinking…");
          else if (evt.type === "agent_message") {
            setMessages((m) => [...m, { agent: evt.agent, text: evt.text, turn: evt.turn }]);
            // update “semantic” position; simple projection scaling into viewport
            setPositions((p) => ({
              ...p,
              [evt.agent]: [evt.proj[0] ?? 0, evt.proj[1] ?? 0],
            }));
          } else if (evt.type === "telemetry") {
            setAvgSim(evt.similarities.avg);
          } else if (evt.type === "consensus") {
            setAvgSim(evt.avgSimilarity);
            setStatus(`Consensus reached (avg sim ${(evt.avgSimilarity * 100).toFixed(1)}%)`);
          } else if (evt.type === "done") {
            setStatus("Conversation completed.");
          } else if (evt.type === "error") {
            setStatus(`Error: ${evt.message}`);
          }
        }
      }
    }

    run();
    return () => { cancelled = true; readerRef.current?.cancel().catch(() => { }); };
  }, []);

  return (
    <div className="grid grid-cols-[1fr_380px] h-screen">
      <div className="relative bg-black">
        <BoidCanvas positions={positions} averageSimilarity={avgSim} />
        <div className="absolute left-4 bottom-4 bg-gray-800 text-white px-3 py-2 rounded">
          Average Similarity {(avgSim * 100).toFixed(1)}%
        </div>
      </div>

      <aside className="bg-slate-900 text-slate-100 p-4 overflow-y-auto">
        <div className="text-sm opacity-80 mb-3">{status}</div>
        <ChatLog
          messages={messages.map((m) => ({
            agentId: m.agent,
            agentName:
              m.agent === "A" ? "Agent A" :
                m.agent === "B" ? "Agent B" :
                  m.agent === "C" ? "Agent C" :
                    "Unknown",
            content: m.text,
            turn: m.turn,
            color:
              m.agent === "A"
                ? "#60a5fa"   // blue
                : m.agent === "B"
                  ? "#34d399"   // green
                  : "#f59e0b",  // amber
          }))}
        />

      </aside>
    </div>
  );
}
