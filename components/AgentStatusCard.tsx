'use client';

import { AGENTS } from '@/lib/agents';

interface AgentStatusCardProps {
  activeAgent: string | null;
}

export default function AgentStatusCard({ activeAgent }: AgentStatusCardProps) {
  return (
    <div className="bg-gray-900 p-4 space-y-3">
      <h3 className="text-white font-semibold text-lg mb-4">Agent Status</h3>
      {AGENTS.map((agent) => {
        const isActive = activeAgent === agent.id;
        return (
          <div
            key={agent.id}
            className={`p-3 rounded-lg border-2 transition-all ${
              isActive
                ? 'border-white bg-gray-800 shadow-lg'
                : 'border-gray-700 bg-gray-850'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-4 h-4 rounded-full transition-all ${
                  isActive ? 'animate-pulse' : ''
                }`}
                style={{ backgroundColor: agent.color }}
              />
              <div className="flex-1">
                <div className="text-white font-medium text-sm">
                  {agent.name}
                </div>
                <div className="text-gray-500 text-xs">
                  {agent.model} • temp: {agent.temperature}
                </div>
              </div>
              {isActive && (
                <div className="text-xs text-gray-400 animate-pulse">
                  Thinking...
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
