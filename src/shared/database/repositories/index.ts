import { PrismaClient } from '@prisma/client'
import { UserRepository } from './user.repository'

export class DatabaseRepositories {
  public readonly user: UserRepository

  constructor(private prisma: PrismaClient) {
    this.user = new UserRepository(prisma)
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