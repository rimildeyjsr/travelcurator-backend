import { config } from '@shared/config';
import { AppError } from '@shared/errors';
import { AIProvider, AIRecommendationRequest, AIResponse } from './types';
import { GeminiProvider } from './providers';

interface CacheEntry {
  data: AIResponse;
  timestamp: number;
}

export class AIService {
  private providers: Map<string, AIProvider> = new Map();
  private cache: Map<string, CacheEntry> = new Map();

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Initialize Gemini provider
    if (config.apis.gemini) {
      this.providers.set('gemini', new GeminiProvider());
    }

    // Future: Initialize other providers
    // if (config.apis.openai) {
    //   this.providers.set('openai', new OpenAIProvider());
    // }

    // Validate that primary provider is available
    if (!this.providers.has(config.ai.provider)) {
      throw new Error(`Primary AI provider '${config.ai.provider}' is not configured. Please set the appropriate API key.`);
    }
  }

  async generateRecommendations(request: AIRecommendationRequest): Promise<AIResponse> {
    const cacheKey = this.generateCacheKey(request);

    // Check cache first
    if (config.ai.enableCaching) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Try primary provider
    const primaryProvider = config.ai.provider;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= config.ai.maxRetries; attempt++) {
      try {
        const result = await this.generateWithProvider(primaryProvider, request);

        // Cache successful result
        if (config.ai.enableCaching) {
          this.setCache(cacheKey, result);
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.warn(`AI generation attempt ${attempt} failed:`, lastError.message);

        if (attempt === config.ai.maxRetries) {
          break;
        }

        // Wait before retry (exponential backoff)
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }

    // Try fallback provider if available
    if (config.ai.fallbackProvider && config.ai.fallbackProvider !== primaryProvider) {
      try {
        const result = await this.generateWithProvider(config.ai.fallbackProvider, request);

        if (config.ai.enableCaching) {
          this.setCache(cacheKey, result);
        }

        return result;
      } catch (fallbackError) {
        console.error('Fallback provider also failed:', fallbackError);
      }
    }

    throw new AppError(
      `AI recommendation generation failed after ${config.ai.maxRetries} attempts: ${lastError?.message}`,
      503
    );
  }

  async generateWithProvider(providerName: string, request: AIRecommendationRequest): Promise<AIResponse> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider '${providerName}' is not available`);
    }

    if (!provider.validateConfig()) {
      throw new Error(`Provider '${providerName}' configuration is invalid`);
    }

    // Add timeout wrapper
    return Promise.race([
      provider.generateRecommendations(request),
      this.timeoutPromise(config.ai.timeout)
    ]);
  }

  private generateCacheKey(request: AIRecommendationRequest): string {
    // Create a stable cache key from request parameters
    const keyData = {
      lat: Math.round(request.latitude * 1000) / 1000, // Round to ~100m precision
      lng: Math.round(request.longitude * 1000) / 1000,
      mood: request.mood,
      preferences: request.preferences?.sort().join(',') || '',
      budget: request.budget || '',
      timeOfDay: request.timeOfDay || '',
      duration: request.duration || 0,
    };

    return Buffer.from(JSON.stringify(keyData)).toString('base64');
  }

  private getFromCache(key: string): AIResponse | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > config.ai.cacheTimeout * 1000;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    // Add cache hit indicator
    entry.data.metadata.cached = true;
    return entry.data;
  }

  private setCache(key: string, data: AIResponse): void {
    // Clone data to avoid mutation
    const clonedData = JSON.parse(JSON.stringify(data));
    clonedData.metadata.cached = false;

    this.cache.set(key, {
      data: clonedData,
      timestamp: Date.now(),
    });

    // Simple cache cleanup - remove old entries if cache gets too large
    if (this.cache.size > 100) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  private async timeoutPromise(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`AI request timeout after ${ms}ms`)), ms);
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility methods
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  getCurrentProvider(): string {
    return config.ai.provider;
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Export singleton instance
export const aiService = new AIService();