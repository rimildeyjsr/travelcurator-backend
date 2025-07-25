import { FastifyRequest } from 'fastify'
import { jwtService } from '@shared/services'
import { db } from '@shared/database'
import { AppError } from '@shared/errors'

// Extend Fastify request to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string
      email: string
    }
  }
}

export async function authMiddleware(
  request: FastifyRequest,
): Promise<void> {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Access token required', 401)
    }

    const token = authHeader.substring(7) // Remove 'Bearer ' prefix

    // Verify and decode token
    const payload = jwtService.verifyAccessToken(token)

    // Optional: Verify user still exists in database
    const user = await db.user.findById(payload.userId)
    if (!user) {
      throw new AppError('User not found', 401)
    }

    // Add user to request object
    request.user = {
      id: user.id,
      email: user.email
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }
    throw new AppError('Invalid access token', 401)
  }
}

// Helper function for easier usage
export function requireAuth() {
  return authMiddleware
}