import jwt from 'jsonwebtoken'
import { config } from '@shared/config'

export interface JwtPayload {
  userId: string
  email: string
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export class JwtService {
  private readonly secret = config.auth.jwtSecret

  generateAccessToken(payload: JwtPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: '15m' })
  }

  generateRefreshToken(): string {
    return jwt.sign({ type: 'refresh' }, this.secret, { expiresIn: '7d' })
  }

  generateTokenPair(payload: JwtPayload): TokenPair {
    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken()
    }
  }

  verifyAccessToken(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, this.secret) as any
      return {
        userId: decoded.userId,
        email: decoded.email
      }
    } catch (error) {
      throw new Error('Invalid or expired access token')
    }
  }

  verifyRefreshToken(token: string): boolean {
    try {
      jwt.verify(token, this.secret)
      return true
    } catch {
      return false
    }
  }
}

export const jwtService = new JwtService()