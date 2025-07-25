import { Type, Static } from '@sinclair/typebox'

// Registration Schema
export const RegisterRequestSchema = Type.Object({
  email: Type.String({
    format: 'email',
    description: 'User email address'
  }),
  password: Type.String({
    minLength: 8,
    maxLength: 128,
    description: 'User password (minimum 8 characters)'
  })
})

export const RegisterResponseSchema = Type.Object({
  user: Type.Object({
    id: Type.String(),
    email: Type.String()
  }),
  accessToken: Type.String({ description: 'JWT access token' }),
  refreshToken: Type.String({ description: 'Refresh token for getting new access tokens' })
})

// Login Schema
export const LoginRequestSchema = Type.Object({
  email: Type.String({
    format: 'email',
    description: 'User email address'
  }),
  password: Type.String({
    description: 'User password'
  })
})

export const LoginResponseSchema = Type.Object({
  user: Type.Object({
    id: Type.String(),
    email: Type.String()
  }),
  accessToken: Type.String({ description: 'JWT access token' }),
  refreshToken: Type.String({ description: 'Refresh token' })
})

// Refresh Token Schema
export const RefreshTokenRequestSchema = Type.Object({
  refreshToken: Type.String({
    description: 'Valid refresh token'
  })
})

export const RefreshTokenResponseSchema = Type.Object({
  accessToken: Type.String({ description: 'New JWT access token' }),
  refreshToken: Type.String({ description: 'New refresh token (rotated)' })
})

// TypeScript types (automatically inferred!)
export type RegisterRequest = Static<typeof RegisterRequestSchema>
export type RegisterResponse = Static<typeof RegisterResponseSchema>
export type LoginRequest = Static<typeof LoginRequestSchema>
export type LoginResponse = Static<typeof LoginResponseSchema>
export type RefreshTokenRequest = Static<typeof RefreshTokenRequestSchema>
export type RefreshTokenResponse = Static<typeof RefreshTokenResponseSchema>