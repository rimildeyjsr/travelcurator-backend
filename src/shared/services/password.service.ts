import bcrypt from 'bcrypt'
import { config } from '@shared/config'

export class PasswordService {
  private readonly saltRounds = config.auth.saltRounds

  async hash(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, this.saltRounds)
  }

  async verify(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword)
  }
}

export const passwordService = new PasswordService()