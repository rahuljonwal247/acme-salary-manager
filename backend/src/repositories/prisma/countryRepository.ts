import type { PrismaClient } from '@prisma/client';
import type { CountryRepository } from '../types';
import { toCountry } from './mappers';

export class PrismaCountryRepository implements CountryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list() {
    const rows = await this.prisma.country.findMany({ orderBy: { name: 'asc' } });
    return rows.map(toCountry);
  }

  async findByCode(code: string) {
    const row = await this.prisma.country.findUnique({ where: { code } });
    return row ? toCountry(row) : null;
  }
}
