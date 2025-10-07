'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import ChatLog from '@/components/ChatLog';
import AgentStatusCard from '@/components/AgentStatusCard';
import { DEFAULT_GOAL } from '@/lib/agents';
import { SimilarityMatrix } from '@/lib/types';

// Dynamic import to avoid SSR issues with Three.js
const BoidCanvas = dynamic(() => import('@/components/BoidCanvas'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-900">
      <div className="text-white">Loading 3D visualization...</div>
    </div>
  ),
});

interface Message {
  agentId: string;
  agentName: string;
  content: string;
  turn: number;
  color: string;
}

export default function FlockPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [similarities, setSimilarities] = useState<SimilarityMatrix | null>(null);
  const [consensusReached, setConsensusReached] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [customGoal, setCustomGoal] = useState('');

  const startSimulation = useCallback(async () => {
    // Reset state
    setMessages([]);
    setSimilarities(null);
    setConsensusReached(false);
    setIsRunning(true);
    setActiveAgent('agent-a');

    try {
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          goal: customGoal || goal,
        }),
      });

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case 'message':
                  setMessages((prev) => [...prev, data.data]);
                  // Update active agent (cycle through agents)
                  const agentIndex = ['agent-a', 'agent-b', 'agent-c'].indexOf(
                    data.data.agentId
                  );
                  const nextAgentIndex = (agentIndex + 1) % 3;
                  setActiveAgent(['agent-a', 'agent-b', 'agent-c'][nextAgentIndex]);
                  break;

                case 'similarity':
                  setSimilarities(data.data.matrix);
                  break;

                case 'consensus':
                  setConsensusReached(true);
                  setActiveAgent(null);
                  break;

                case 'complete':
                  setIsRunning(false);
                  setActiveAgent(null);
                  break;
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error running simulation:', error);
      setIsRunning(false);
      setActiveAgent(null);
    }
  }, [goal, customGoal]);

  return (
    <div className="h-screen flex flex-col bg-black">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Convergent v0.1
            </h1>
            <p className="text-gray-400 text-sm">
              Triadic Consensus Simulation
            </p>
          </div>
          <button
            onClick={startSimulation}
            disabled={isRunning}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              isRunning
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl'
            }`}
          >
            {isRunning ? 'Running...' : 'Start Simulation'}
          </button>
        </div>

        {/* Goal input */}
        <div className="mt-4">
          <label className="text-gray-400 text-sm mb-2 block">
            Shared Goal (leave empty for default)
          </label>
          <input
            type="text"
            value={customGoal}
            onChange={(e) => setCustomGoal(e.target.value)}
            disabled={isRunning}
            placeholder={goal}
            className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Agent Status */}
        <aside className="w-80 border-r border-gray-800 overflow-y-auto">
          <AgentStatusCard activeAgent={activeAgent} />
        </aside>

        {/* Center - 3D Visualization */}
        <main className="flex-1 relative">
          <BoidCanvas
            similarities={similarities}
            consensusReached={consensusReached}
          />
        </main>

        {/* Right sidebar - Chat Log */}
        <aside className="w-96 border-l border-gray-800">
          <ChatLog messages={messages} />
        </aside>
      </div>

      {/* Footer stats */}
      <footer className="bg-gray-900 border-t border-gray-800 px-6 py-3">
        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-400">
            Messages: <span className="text-white font-semibold">{messages.length}</span>
          </div>
          <div className="text-gray-400">
            Status:{' '}
            <span
              className={`font-semibold ${
                consensusReached
                  ? 'text-green-400'
                  : isRunning
                  ? 'text-blue-400'
                  : 'text-gray-400'
              }`}
            >
              {consensusReached
                ? 'Consensus Reached'
                : isRunning
                ? 'Running'
                : 'Idle'}
            </span>
          </div>
          <div className="text-gray-400">
            Similarity:{' '}
            <span className="text-white font-semibold">
              {similarities
                ? `${(
                    (Object.values(similarities).reduce(
                      (sum, row) =>
                        sum +
                        Object.entries(row).reduce(
                          (s, [k, v]) => (k !== Object.keys(similarities)[0] ? s + v : s),
                          0
                        ),
                      0
                    ) /
                      6) *
                    100
                  ).toFixed(1)}%`
                : 'N/A'}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
