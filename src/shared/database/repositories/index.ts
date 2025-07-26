import { PrismaClient } from '@prisma/client'
import { UserRepository } from '@shared/database'
import { UserSessionRepository } from '@shared/database'
import { LocationRepository } from '@shared/database'

export class DatabaseRepositories {
  public readonly user: UserRepository
  public readonly userSession: UserSessionRepository
  public readonly location: LocationRepository

  constructor(private prisma: PrismaClient) {
    this.user = new UserRepository(prisma)
    this.userSession = new UserSessionRepository(prisma)
    this.location = new LocationRepository(prisma)
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect()
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return true
    } catch {
      return false
    }
  }
}

export * from './user.repository'
export * from './user-session.repository'
export * from './location.repository'