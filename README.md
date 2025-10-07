# 🧭 Convergent v0.2 — Emergent Consensus Simulation

**Convergent** explores how multiple AI agents form consensus through structured conversation and visualized collective behaviour.
Each agent represents a unique persona, reasoning style, and viewpoint — all interacting within a shared “semantic ecosystem” rendered as an evolving **flocking simulation**.

---

## 🧠 Concept

> *“When intelligent systems discuss a problem, do their thoughts converge?”*

This system models that question.
A group of AI agents (OpenAI GPT-4o, Anthropic Claude-3.5, and Google Gemini 1.5 Pro) engage in structured, rule-driven dialogue toward a shared goal.
Their exchanges are analyzed for **semantic similarity** (via OpenAI embeddings) and **visualized as boids**, where proximity equals conceptual alignment.

When consensus emerges — similarity > 0.9 — the agents visually **converge** in 3D space.

---

## 🧩 Architecture

| Layer             | Component                                                            | Purpose                                                                                                                |
| ----------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Backend**       | `/app/api/agents/route.ts`                                           | Orchestrates agent turns, generates responses, computes embeddings, streams updates via Server-Sent Events (SSE).      |
| **Frontend**      | `/app/flock/page.tsx`                                                | React client for simulation control and real-time visualization.                                                       |
| **Visualization** | `components/BoidCanvas.tsx`                                          | React-Three-Fiber canvas rendering agents as animated boids, positioned by semantic similarity and interaction “heat.” |
| **Controls/UI**   | `components/ControlsPanel.tsx`, `ChatLog.tsx`, `AgentStatusCard.tsx` | Manage parameters, show message flow, and monitor consensus evolution.                                                 |

---

## 🧮 Core Mechanics

1. **Agent Creation**
   Each agent has a randomly assigned persona: *Collaborator*, *Skeptic*, or *Contrarian*, with temperature variance and optional “voice traits” (humour, rigor, optimism, etc.).

2. **Turn Loop**

   * Active agents exchange ideas in clusters within a “talk radius.”
   * Each agent’s output is tagged with a `<META>` stance (+1/0/-1) and proposal.
   * Consensus is detected per-cluster when ≥ 60 % of participants support the same proposal.

3. **Physics Simulation**

   * Positions evolve via boid dynamics (alignment / cohesion / separation).
   * Conversation “heat” attracts nearby agents, forming visible social clusters.
   * Wander, join, and leave probabilities keep the system dynamic.

4. **Streaming Output**
   All agent activity, positions, and telemetry are emitted via SSE for real-time rendering.

---

## 🧰 Tech Stack

* **Framework:** Next.js 15 (App Router, Turbopack)
* **Language:** TypeScript 5
* **AI SDK:** Vercel AI SDK v5
  *(supports OpenAI, Anthropic, Google models)*
* **Graphics:** React-Three-Fiber + Three.js
* **Styling:** Tailwind CSS v4
* **Embeddings:** OpenAI `text-embedding-3-small`

---

## ⚙️ Configuration Highlights

| Parameter         | Default | Description                              |
| ----------------- | ------- | ---------------------------------------- |
| `agentCount`      | 3       | Active agents (2–12 supported)           |
| `maxTurns`        | 6       | Conversation rounds                      |
| `talkRadius`      | 0.28    | Cluster proximity threshold              |
| `speakRate`       | 0.6     | Probability an agent speaks per turn     |
| `consensusThresh` | 0.6     | % agreement needed for cluster consensus |

---

## 🧪 Running Locally

```bash
npm install
npm run dev
# → http://localhost:3000/flock
```

Create `.env.local` with:

```env
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GOOGLE_GENERATIVE_AI_API_KEY=...
```

---

## 🔭 Future Directions

* N-agent scalability and memory persistence
* Embedding-space clustering visualization
* Real-time temperature and trait controls
* Consensus replay and export tools
* 3D “semantic gravity wells” for idea attraction

---

**In essence:** *Convergent* visualizes how ideas migrate, collide, and coalesce — where language models behave like minds in motion.
