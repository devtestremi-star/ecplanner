import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import ormConfig from '@timeline/db/mikro-orm.config';
import { AdminModule } from './admin/admin.module.js';
import { DbExceptionFilter } from './admin/db-exception.filter.js';
import { HealthController } from './health.controller.js';
import { PurgeController } from './purge.controller.js';
import { RunsController } from './runs.controller.js';
import { SpellsController } from './spells.controller.js';
import { WowheadService } from './wowhead.service.js';
import { ScanModule } from './scan.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // MikroOrmModule installe un middleware qui forke l'EntityManager par requête.
    // Sans ce fork, l'identity map fuit d'une requête à l'autre — le piège de l'Unit of Work.
    MikroOrmModule.forRoot(ormConfig),
    // CRUD générique sur les 9 tables, monté sous /api/admin, derrière une session (AdminGuard).
    AdminModule,
    ScanModule,
  ],
  controllers: [HealthController, PurgeController, RunsController, SpellsController],
  providers: [
    WowheadService,
    // Global, et donc ici plutôt que dans AdminModule : les routes publiques en profitent aussi.
    { provide: APP_FILTER, useClass: DbExceptionFilter },
  ],
})
export class AppModule {}
