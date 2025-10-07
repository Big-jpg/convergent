import { cosineSimilarity, embed } from 'ai';
import { openai } from '@ai-sdk/openai';
import { SimilarityMatrix } from './types';

/**
 * Generate embedding for a text using OpenAI's text-embedding-3-small model
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.textEmbeddingModel('text-embedding-3-small'),
    value: text,
  });
  return embedding;
}

/**
 * Compute pairwise cosine similarity between all agent embeddings
 */
export function computeSimilarityMatrix(
  embeddings: { agentId: string; embedding: number[] }[]
): SimilarityMatrix {
  const matrix: SimilarityMatrix = {};

  for (let i = 0; i < embeddings.length; i++) {
    const agentI = embeddings[i];
    matrix[agentI.agentId] = {};

    for (let j = 0; j < embeddings.length; j++) {
      const agentJ = embeddings[j];
      if (i === j) {
        matrix[agentI.agentId][agentJ.agentId] = 1.0;
      } else {
        const similarity = cosineSimilarity(agentI.embedding, agentJ.embedding);
        matrix[agentI.agentId][agentJ.agentId] = similarity;
      }
    }
  }

  return matrix;
}

/**
 * Check if consensus has been reached based on similarity threshold
 */
export function checkConsensus(
  matrix: SimilarityMatrix,
  threshold: number
): boolean {
  const agentIds = Object.keys(matrix);
  
  // Check all pairwise similarities
  for (let i = 0; i < agentIds.length; i++) {
    for (let j = i + 1; j < agentIds.length; j++) {
      const similarity = matrix[agentIds[i]][agentIds[j]];
      if (similarity < threshold) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Get average similarity across all agents
 */
export function getAverageSimilarity(matrix: SimilarityMatrix): number {
  const agentIds = Object.keys(matrix);
  let sum = 0;
  let count = 0;

  for (let i = 0; i < agentIds.length; i++) {
    for (let j = i + 1; j < agentIds.length; j++) {
      sum += matrix[agentIds[i]][agentIds[j]];
      count++;
    }
  }

  return count > 0 ? sum / count : 0;
}
