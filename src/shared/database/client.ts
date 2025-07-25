import { PrismaClient } from '@prisma/client'
import { config } from '@shared/config'
import { DatabaseRepositories } from './repositories'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: config.server.nodeEnv === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

if (config.server.nodeEnv !== 'production') globalForPrisma.prisma = prisma

// Export repositories and prisma
export const db = new DatabaseRepositories(prisma)
export { prisma }