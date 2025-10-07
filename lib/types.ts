export interface AgentConfig {
  id: string;
  name: string;
  model: string;
  temperature: number;
  color: string;
}

export interface AgentMessage {
  agentId: string;
  agentName: string;
  content: string;
  embedding: number[];
  timestamp: number;
  turn: number;
}

export interface SimilarityMatrix {
  [key: string]: {
    [key: string]: number;
  };
}

export interface ConversationState {
  messages: AgentMessage[];
  similarities: SimilarityMatrix[];
  consensusReached: boolean;
  currentTurn: number;
}

export interface StreamUpdate {
  type: 'message' | 'similarity' | 'consensus' | 'complete';
  data: any;
}
