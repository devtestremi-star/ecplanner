import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import ormConfig from '@timeline/db/mikro-orm.config';
import { AdminModule } from './admin/admin.module.js';
import { DbExceptionFilter } from './admin/db-exception.filter.js';
import { isDeployed } from './auth.js';
import { HealthController } from './health.controller.js';
import { PurgeController } from './purge.controller.js';
import { RunsController } from './runs.controller.js';
import { SpellsController } from './spells.controller.js';
import { WowheadService } from './wowhead.service.js';
import { ScanService } from './scan.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // MikroOrmModule installe un middleware qui forke l'EntityManager par requête.
    // Sans ce fork, l'identity map fuit d'une requête à l'autre — le piège de l'Unit of Work.
    MikroOrmModule.forRoot(ormConfig),
    /**
     * CRUD générique sur les 9 tables, monté sous /api/admin — EN LOCAL SEULEMENT. Une fois
     * déployé, le module n'existe pas : /api/admin répond 404, il n'y a rien à attaquer.
     * Pour administrer la prod, on lance l'API en local sur la base Neon (`dev:api:neon`).
     */
    ...(isDeployed() ? [] : [AdminModule]),
  ],
  controllers: [HealthController, PurgeController, RunsController, SpellsController],
  providers: [
    ScanService,
    WowheadService,
    // Global, et donc ici plutôt que dans AdminModule : les routes publiques en profitent
    // aussi, y compris une fois déployé où l'admin n'est pas monté.
    { provide: APP_FILTER, useClass: DbExceptionFilter },
  ],
})
export class AppModule {}
