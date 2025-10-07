import { AgentConfig } from './types';

export const AGENTS: AgentConfig[] = [
  {
    id: 'agent-a',
    name: 'Agent A (GPT-4o)',
    model: 'gpt-4o',
    temperature: 0.5,
    color: '#3b82f6', // blue
  },
  {
    id: 'agent-b',
    name: 'Agent B (Claude-3 Opus)',
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.7,
    color: '#8b5cf6', // purple
  },
  {
    id: 'agent-c',
    name: 'Agent C (Gemini 1.5 Pro)',
    model: 'gemini-1.5-pro',
    temperature: 0.6,
    color: '#10b981', // green
  },
];

export const DEFAULT_GOAL = `Determine the most sustainable energy source for a lunar research outpost, considering efficiency, reliability, and feasibility within 2040 technology.`;

export const MAX_TURNS = 5;
export const SIMILARITY_THRESHOLD = 0.9;
