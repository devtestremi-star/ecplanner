import { EntityManager } from '@mikro-orm/postgresql';
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  constructor(private readonly em: EntityManager) {}

  @Get()
  async check(): Promise<{ status: string; db: string; emForked: boolean }> {
    const rows = await this.em.getConnection().execute<Array<{ ok: number }>>('select 1 as ok');
    return {
      status: 'ok',
      db: rows[0]?.ok === 1 ? 'up' : 'down',
      // Preuve que le middleware a bien forké : l'EM de la requête n'est pas le global.
      emForked: this.em.getContext() !== this.em,
    };
  }
}
