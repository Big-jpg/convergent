# Convergent v0.1 — Triadic Consensus Simulation

A Next.js application where three AI agents from different models (GPT-4o, Claude-3 Opus, Gemini 1.5 Pro) collaborate toward consensus on a shared goal, with their conversation visualized as a flocking system driven by cosine similarity of their messages.

## Features

- **Multi-Model Agent Orchestration**: Three AI agents with different reasoning styles and temperatures
- **Round-Robin Dialogue**: Agents take turns responding and building on each other's ideas
- **Semantic Similarity Tracking**: Real-time embedding generation and cosine similarity computation
- **3D Visualization**: React-Three-Fiber boid system where agents converge as similarity increases
- **Real-Time Streaming**: Server-Sent Events (SSE) for live updates
- **Consensus Detection**: Automatic detection when similarity threshold (0.9) is reached

## Architecture

### Backend (`/app/api/agents/route.ts`)
- Agent orchestrator with round-robin conversation loop
- Embedding generation using OpenAI's `text-embedding-3-small`
- Pairwise cosine similarity computation
- SSE streaming for real-time updates

### Frontend (`/app/flock/page.tsx`)
- Main simulation interface
- Real-time message display
- Agent status indicators
- Custom goal input

### Visualization (`/components/BoidCanvas.tsx`)
- 3D scene with React-Three-Fiber
- Animated boids representing agents
- Dynamic positioning based on similarity
- Connection lines showing relationships
- Orbital camera controls

### Components
- **ChatLog**: Conversation history with color-coded messages
- **AgentStatusCard**: Real-time agent status and activity
- **BoidCanvas**: 3D visualization with flocking behavior

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Keys

Create a `.env.local` file in the project root:

```env
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key_here
```

**Where to get API keys:**
- OpenAI: https://platform.openai.com/api-keys
- Anthropic: https://console.anthropic.com/settings/keys
- Google AI: https://aistudio.google.com/app/apikey

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Start Simulation**: Click the "Start Simulation" button
2. **Custom Goal**: Enter a custom goal or use the default lunar energy source question
3. **Watch Convergence**: Observe agents discussing and converging in real-time
4. **3D Visualization**: Use mouse to orbit, zoom, and pan the 3D scene
5. **Monitor Progress**: Track similarity percentage and consensus status

## Configuration

Edit `/lib/agents.ts` to customize:

```typescript
export const MAX_TURNS = 5; // Maximum conversation rounds
export const SIMILARITY_THRESHOLD = 0.9; // Consensus threshold (0-1)
```

Agent configurations:
- **Agent A (GPT-4o)**: Temperature 0.5 (more focused)
- **Agent B (Claude-3 Opus)**: Temperature 0.7 (more creative)
- **Agent C (Gemini 1.5 Pro)**: Temperature 0.6 (balanced)

## How It Works

### 1. Conversation Loop
```
For each turn (max 5):
  For each agent (A, B, C):
    - Generate response based on conversation history
    - Create embedding of response
    - Stream message to frontend
  
  - Compute pairwise similarity matrix
  - Check if consensus reached (all pairs > 0.9)
  - Stream similarity data to frontend
  
  If consensus: break
```

### 2. Visualization
- Initial position: Agents form a triangle
- As similarity increases: Agents move closer together
- Connection lines: Opacity reflects similarity strength
- Consensus: "CONSENSUS REACHED" text appears

### 3. Streaming Protocol
```typescript
// Message update
{ type: 'message', data: { agentId, agentName, content, turn, color } }

// Similarity update
{ type: 'similarity', data: { matrix, average, turn } }

// Consensus reached
{ type: 'consensus', data: { turn, avgSimilarity } }

// Simulation complete
{ type: 'complete', data: { consensusReached, totalMessages } }
```

## Tech Stack

- **Framework**: Next.js 15.5.4 (App Router)
- **Language**: TypeScript
- **AI SDK**: Vercel AI SDK v5
- **3D Graphics**: React-Three-Fiber + Three.js
- **Styling**: Tailwind CSS v4
- **Models**: 
  - OpenAI GPT-4o
  - Anthropic Claude-3.5 Sonnet
  - Google Gemini 1.5 Pro
  - OpenAI text-embedding-3-small (embeddings)

## Project Structure

```
convergent/
├── app/
│   ├── api/agents/route.ts    # Agent orchestrator API
│   ├── flock/page.tsx         # Main simulation page
│   ├── layout.tsx             # Root layout
│   └── page.tsx               # Home (redirects to /flock)
├── components/
│   ├── BoidCanvas.tsx         # 3D visualization
│   ├── ChatLog.tsx            # Conversation display
│   └── AgentStatusCard.tsx    # Agent status panel
├── lib/
│   ├── agents.ts              # Agent configurations
│   ├── similarity.ts          # Embedding & similarity functions
│   └── types.ts               # TypeScript types
└── package.json
```

## Extending the System

### Add More Agents
1. Add agent config to `/lib/agents.ts`
2. Update visualization to handle N agents
3. Adjust similarity computation for N agents

### Change Models
Edit `/lib/agents.ts`:
```typescript
{
  id: 'agent-d',
  name: 'Agent D (New Model)',
  model: 'model-name',
  temperature: 0.6,
  color: '#ff6b6b',
}
```

### Adjust Visualization
Edit `/components/BoidCanvas.tsx`:
- Modify boid behavior in `useFrame` hook
- Change positioning algorithm
- Add trails or force lines

## Troubleshooting

**API Keys Not Working**
- Ensure `.env.local` is in project root
- Restart dev server after adding keys
- Check key validity on provider websites

**3D Scene Not Loading**
- BoidCanvas uses dynamic import to avoid SSR issues
- Check browser console for Three.js errors
- Ensure WebGL is supported in your browser

**Slow Response Times**
- Normal for first request (cold start)
- Each agent generates ~100-300 tokens
- Embedding generation adds ~1-2s per message

## License

MIT

## Credits

Built with:
- [Vercel AI SDK](https://sdk.vercel.ai/)
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber/)
- [Next.js](https://nextjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
