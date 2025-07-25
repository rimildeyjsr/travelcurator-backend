import { AIProvider, AIRecommendationRequest, AIResponse } from '../types';

export class OpenAIProvider implements AIProvider {
  constructor() {
    // TODO: Implement OpenAI provider
    throw new Error('OpenAI provider not yet implemented');
  }

  async generateRecommendations(_request: AIRecommendationRequest): Promise<AIResponse> {
    throw new Error('OpenAI provider not yet implemented');
  }

  validateConfig(): boolean {
    return false;
  }

  getProviderName(): string {
    return 'openai';
  }

  getModelName(): string {
    return 'gpt-4o';
  }
}