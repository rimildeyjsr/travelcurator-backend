export interface AIRecommendationRequest {
  latitude: number;
  longitude: number;
  mood: 'energetic' | 'relaxed' | 'curious' | 'hungry' | 'cultural';
  preferences?: string[];
  budget?: 'low' | 'medium' | 'high';
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  duration?: number; // hours available
}

export interface AIRecommendation {
  name: string;
  category: string;
  description: string;
  reasoning: string;
  estimatedDuration?: string;
  priceRange?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export interface AIResponse {
  recommendations: AIRecommendation[];
  metadata: {
    provider: string;
    model: string;
    responseTime: number;
    tokensUsed?: number;
    cost?: number;
    cached?: boolean
  };
}

export interface AIProvider {
  generateRecommendations(request: AIRecommendationRequest): Promise<AIResponse>;
  validateConfig(): boolean;
  getProviderName(): string;
  getModelName(): string;
}

export interface AIProviderConfig {
  gemini?: {
    apiKey: string;
    model: 'gemini-1.5-flash' | 'gemini-1.5-pro';
  };
  openai?: {
    apiKey: string;
    model: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-3.5-turbo';
  };
  claude?: {
    apiKey: string;
    model: 'claude-3-5-sonnet' | 'claude-3-haiku';
  };
}