import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async findActiveById(id: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { id, deleted: false },
    });
  }

  async findActiveByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    return this.usersRepo.find({
      where: { id: In(ids), deleted: false },
    });
  }

  async findActiveByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { email: email.toLowerCase().trim(), deleted: false },
    });
  }

  /** Inclui contas eliminadas logicamente (ex.: login / reutilização de email). */
  async findAnyByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { email: email.toLowerCase().trim() },
    });
  }

  async findByProviderAndSubject(
    authProvider: string,
    oauthSubject: string,
  ): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { authProvider, oauthSubject, deleted: false },
    });
  }

  async findByEmailVerificationToken(token: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { emailVerificationToken: token, deleted: false },
    });
  }

  async save(user: User): Promise<User> {
    return this.usersRepo.save(user);
  }

  createPartial(data: Partial<User>): User {
    return this.usersRepo.create(data);
  }
}
