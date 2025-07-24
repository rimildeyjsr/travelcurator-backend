import { Type, Static } from '@sinclair/typebox'

export const HelloRequestSchema = Type.Object({
  name: Type.String({
    minLength: 1,
    maxLength: 50,
    description: 'Name of the person to greet'
  })
})

export const HelloResponseSchema = Type.Object({
  message: Type.String({ description: 'Greeting message' }),
  timestamp: Type.String({ description: 'ISO timestamp' })
})

// TypeScript types are automatically inferred!
export type HelloRequest = Static<typeof HelloRequestSchema>
export type HelloResponse = Static<typeof HelloResponseSchema>