import { type PrismaClient, type User, type Prisma } from '@prisma/client'

export class UserRepository {
  constructor(private prisma: PrismaClient) {}

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data })
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } })
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } })
  }

  async updatePreferences(id: string, preferences: any): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { preferences }
    })
  }
}