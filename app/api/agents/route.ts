import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { AGENTS, DEFAULT_GOAL, MAX_TURNS, SIMILARITY_THRESHOLD } from '@/lib/agents';
import { AgentMessage, StreamUpdate } from '@/lib/types';
import { generateEmbedding, computeSimilarityMatrix, checkConsensus, getAverageSimilarity } from '@/lib/similarity';

export const maxDuration = 300; // 5 minutes max

export async function POST(req: Request) {
  const encoder = new TextEncoder();
  const { goal } = await req.json();
  const conversationGoal = goal || DEFAULT_GOAL;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const messages: AgentMessage[] = [];
        let consensusReached = false;

        // Helper function to send updates to client
        const sendUpdate = (update: StreamUpdate) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(update)}\n\n`)
          );
        };

        // Initial system message for context
        const systemPrompt = `You are participating in a collaborative discussion with two other AI agents. Your goal is: "${conversationGoal}"

Please provide thoughtful, evidence-based reasoning. Consider the perspectives of other agents and work toward a consensus solution.`;

        // Round-robin conversation loop
        for (let turn = 0; turn < MAX_TURNS && !consensusReached; turn++) {
          console.log(`\n=== Turn ${turn + 1} ===`);

          // Each agent responds in sequence
          for (const agent of AGENTS) {
            console.log(`\n${agent.name} is thinking...`);

            // Build conversation history for this agent
            const conversationHistory = messages.map((msg) => ({
              role: 'assistant' as const,
              content: `[${msg.agentName}]: ${msg.content}`,
            }));

            // Determine the model provider
            let modelProvider;
            if (agent.model.startsWith('gpt')) {
              modelProvider = openai(agent.model);
            } else if (agent.model.startsWith('claude')) {
              modelProvider = anthropic(agent.model);
            } else if (agent.model.startsWith('gemini')) {
              modelProvider = google(agent.model);
            } else {
              throw new Error(`Unknown model: ${agent.model}`);
            }

            // Generate agent response
            const result = await generateText({
              model: modelProvider,
              temperature: agent.temperature,
              messages: [
                { role: 'system', content: systemPrompt },
                ...conversationHistory,
                {
                  role: 'user',
                  content:
                    turn === 0 && agent.id === 'agent-a'
                      ? `Please start the discussion by proposing an initial stance on: ${conversationGoal}`
                      : `Based on the discussion so far, please provide your perspective, critique, or synthesis.`,
                },
              ],
            });

            const content = result.text;
            console.log(`${agent.name}: ${content.substring(0, 100)}...`);

            // Generate embedding for the response
            const embedding = await generateEmbedding(content);

            // Create message object
            const message: AgentMessage = {
              agentId: agent.id,
              agentName: agent.name,
              content,
              embedding,
              timestamp: Date.now(),
              turn: turn + 1,
            };

            messages.push(message);

            // Send message update to client
            sendUpdate({
              type: 'message',
              data: {
                agentId: agent.id,
                agentName: agent.name,
                content,
                turn: turn + 1,
                color: agent.color,
              },
            });
          }

          // After all agents have responded, compute similarity matrix
          const embeddings = messages
            .slice(-3)
            .map((msg) => ({
              agentId: msg.agentId,
              embedding: msg.embedding,
            }));

          const similarityMatrix = computeSimilarityMatrix(embeddings);
          const avgSimilarity = getAverageSimilarity(similarityMatrix);
          consensusReached = checkConsensus(similarityMatrix, SIMILARITY_THRESHOLD);

          console.log(`Average similarity: ${avgSimilarity.toFixed(3)}`);
          console.log(`Consensus reached: ${consensusReached}`);

          // Send similarity update to client
          sendUpdate({
            type: 'similarity',
            data: {
              matrix: similarityMatrix,
              average: avgSimilarity,
              turn: turn + 1,
            },
          });

          // Check for consensus
          if (consensusReached) {
            sendUpdate({
              type: 'consensus',
              data: {
                turn: turn + 1,
                avgSimilarity,
              },
            });
            break;
          }
        }

        // Send completion signal
        sendUpdate({
          type: 'complete',
          data: {
            consensusReached,
            totalMessages: messages.length,
          },
        });

        controller.close();
      } catch (error) {
        console.error('Error in agent orchestration:', error);
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
