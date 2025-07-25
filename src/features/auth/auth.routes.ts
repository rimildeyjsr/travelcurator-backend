import { FastifyInstance } from 'fastify'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import {
  RegisterRequestSchema,
  RegisterResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  RefreshTokenRequestSchema,
  RefreshTokenResponseSchema
} from '@shared/schemas/auth.schema'
import { passwordService, jwtService } from '@shared/services'
import { db } from '@shared/database'
import { AppError } from '@shared/errors'

async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const server = fastify.withTypeProvider<TypeBoxTypeProvider>()

  // Registration endpoint
  server.post('/api/auth/register', {
    schema: {
      body: RegisterRequestSchema,
      response: {
        201: RegisterResponseSchema
      }
    }
  }, async (request, reply) => {
    const { email, password } = request.body

    // Check if user already exists
    const existingUser = await db.user.findByEmail(email)
    if (existingUser) {
      throw new AppError('User with this email already exists', 409)
    }

    // Hash password
    const hashedPassword = await passwordService.hash(password)

    // Create user - use the direct Prisma input structure
    const user = await db.user.create({
      email,
      password: hashedPassword
    })

    // Generate tokens
    const tokens = jwtService.generateTokenPair({
      userId: user.id,
      email: user.email
    })

    // Store refresh token with Prisma's relationship syntax
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days from now

    await db.userSession.create({
      user: { connect: { id: user.id } },
      refreshToken: tokens.refreshToken,
      expiresAt
    })

    reply.status(201)
    return {
      user: {
        id: user.id,
        email: user.email
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    }
  })

  // Login endpoint
  server.post('/api/auth/login', {
    schema: {
      body: LoginRequestSchema,
      response: {
        200: LoginResponseSchema
      }
    }
  }, async (request) => {
    const { email, password } = request.body

    // Find user by email
    const user = await db.user.findByEmail(email)
    if (!user) {
      throw new AppError('Invalid email or password', 401)
    }

    // Verify password
    const isValidPassword = await passwordService.verify(password, user.password)
    if (!isValidPassword) {
      throw new AppError('Invalid email or password', 401)
    }

    // Generate tokens
    const tokens = jwtService.generateTokenPair({
      userId: user.id,
      email: user.email
    })

    // Store refresh token
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days from now

    await db.userSession.create({
      user: { connect: { id: user.id } },
      refreshToken: tokens.refreshToken,
      expiresAt
    })

    return {
      user: {
        id: user.id,
        email: user.email
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    }
  })

  // Refresh token endpoint
  server.post('/api/auth/refresh', {
    schema: {
      body: RefreshTokenRequestSchema,
      response: {
        200: RefreshTokenResponseSchema
      }
    }
  }, async (request) => {
    const { refreshToken } = request.body

    // Verify refresh token format
    const isValidFormat = jwtService.verifyRefreshToken(refreshToken)
    if (!isValidFormat) {
      throw new AppError('Invalid refresh token', 401)
    }

    // Find refresh token in database
    const session = await db.userSession.findByRefreshToken(refreshToken)
    if (!session) {
      throw new AppError('Refresh token not found', 401)
    }

    // Check if token is expired
    if (session.expiresAt < new Date()) {
      // Clean up expired token
      await db.userSession.deleteByRefreshToken(refreshToken)
      throw new AppError('Refresh token expired', 401)
    }

    // Generate new tokens
    const newTokens = jwtService.generateTokenPair({
      userId: session.userId,
      email: session.user.email
    })

    // Delete old refresh token and create new one (token rotation for security)
    await db.userSession.deleteByRefreshToken(refreshToken)

    const newExpiresAt = new Date()
    newExpiresAt.setDate(newExpiresAt.getDate() + 7)

    await db.userSession.create({
      user: { connect: { id: session.userId } },
      refreshToken: newTokens.refreshToken,
      expiresAt: newExpiresAt
    })

    return {
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken
    }
  })
}

export default authRoutes