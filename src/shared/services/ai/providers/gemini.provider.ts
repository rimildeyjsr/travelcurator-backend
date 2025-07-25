import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '@shared/config';
import { AIProvider, AIRecommendationRequest, AIResponse, AIRecommendation } from '../types';

export class GeminiProvider implements AIProvider {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private modelName: string;

  constructor(modelName: 'gemini-1.5-flash' | 'gemini-1.5-pro' = 'gemini-1.5-flash') {
    if (!config.apis.gemini) {
      throw new Error('GEMINI_API_KEY is required but not configured');
    }

    this.genAI = new GoogleGenerativeAI(config.apis.gemini);
    this.modelName = modelName;
    this.model = this.genAI.getGenerativeModel({ model: modelName });
  }

  async generateRecommendations(request: AIRecommendationRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      const prompt = this.buildPrompt(request);
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      const recommendations = this.parseResponse(text);
      const responseTime = Date.now() - startTime;

      return {
        recommendations,
        metadata: {
          provider: 'gemini',
          model: this.modelName,
          responseTime,
          tokensUsed: response.usageMetadata?.totalTokenCount,
          cost: this.calculateCost(response.usageMetadata?.totalTokenCount || 0),
        },
      };
    } catch (error) {
      throw new Error(`Gemini API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private buildPrompt(request: AIRecommendationRequest): string {
    const { latitude, longitude, mood, preferences, budget, timeOfDay, duration } = request;

    return `You are a knowledgeable local travel guide. Generate 5-7 personalized travel recommendations for this location and context.

LOCATION: ${latitude}, ${longitude}
MOOD: ${mood}
PREFERENCES: ${preferences?.join(', ') || 'None specified'}
BUDGET: ${budget || 'Not specified'}
TIME: ${timeOfDay || 'Not specified'}
DURATION: ${duration ? `${duration} hours` : 'Not specified'}

MOOD CONTEXT:
- energetic: Active experiences, sports, adventures, hiking
- relaxed: Peaceful spots, spas, parks, quiet cafes
- curious: Museums, historical sites, unique local experiences
- hungry: Restaurants, food markets, cooking classes, local cuisine
- cultural: Art galleries, theaters, cultural centers, festivals

REQUIREMENTS:
1. Focus on experiences that match the mood and preferences
2. Include mix of well-known and hidden gem locations
3. Consider the time of day and duration
4. Provide specific, actionable recommendations
5. Include brief reasoning for each suggestion

FORMAT YOUR RESPONSE AS JSON:
{
  "recommendations": [
    {
      "name": "Specific place or experience name",
      "category": "restaurant|attraction|activity|shopping|cultural|nature",
      "description": "2-3 sentence description of what makes this special",
      "reasoning": "Why this fits their mood and context",
      "estimatedDuration": "30 minutes|1-2 hours|Half day|etc",
      "priceRange": "Free|$|$$|$$$"
    }
  ]
}

Generate recommendations that feel authentic and locally-informed. Avoid generic tourist traps unless they truly fit the mood.`;
  }

  private parseResponse(response: string): AIRecommendation[] {
    try {
      // Clean the response - remove any markdown formatting
      const cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      const parsed = JSON.parse(cleanResponse);

      if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
        throw new Error('Invalid response format: missing recommendations array');
      }

      return parsed.recommendations.map((rec: any) => ({
        name: rec.name || 'Unknown',
        category: rec.category || 'activity',
        description: rec.description || '',
        reasoning: rec.reasoning || '',
        estimatedDuration: rec.estimatedDuration,
        priceRange: rec.priceRange,
      }));
    } catch (error) {
      console.error('Failed to parse AI response:', response);

      // Fallback: return a basic recommendation if parsing fails
      return [{
        name: 'Explore Local Area',
        category: 'activity',
        description: 'Take a walk around the local area and discover what interests you.',
        reasoning: 'AI response parsing failed, providing fallback recommendation.',
        estimatedDuration: '1-2 hours',
        priceRange: 'Free',
      }];
    }
  }

  private calculateCost(tokens: number): number {
    // Gemini 1.5 Flash pricing: $0.075 per 1M input tokens, $0.30 per 1M output tokens
    // Rough estimate: assume 60% input, 40% output
    const inputTokens = tokens * 0.6;
    const outputTokens = tokens * 0.4;

    const inputCost = (inputTokens / 1_000_000) * 0.075;
    const outputCost = (outputTokens / 1_000_000) * 0.30;

    return inputCost + outputCost;
  }

  validateConfig(): boolean {
    return !!config.apis.gemini;
  }

  getProviderName(): string {
    return 'gemini';
  }

  getModelName(): string {
    return this.modelName;
  }
}