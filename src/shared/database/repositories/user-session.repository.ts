import { PrismaClient, UserSession, Prisma } from '@prisma/client'

export class UserSessionRepository {
  constructor(private prisma: PrismaClient) {}

  async create(data: Prisma.UserSessionCreateInput): Promise<UserSession> {
    return this.prisma.userSession.create({ data })
  }

  async findByRefreshToken(refreshToken: string) {
    return this.prisma.userSession.findUnique({
      where: { refreshToken },
      include: { user: true }
    })
  }

  async deleteByRefreshToken(refreshToken: string): Promise<void> {
    await this.prisma.userSession.delete({
      where: { refreshToken }
    })
  }

  async deleteExpiredSessions(): Promise<void> {
    await this.prisma.userSession.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    })
  }

  async deleteAllUserSessions(userId: string): Promise<void> {
    await this.prisma.userSession.deleteMany({
      where: { userId }
    })
  }
}