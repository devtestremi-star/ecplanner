import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import ormConfig from '@timeline/db/mikro-orm.config';
import { AdminModule } from './admin/admin.module.js';
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
    // CRUD générique sur les 9 tables, monté sous /api/admin.
    AdminModule,
  ],
  controllers: [HealthController, PurgeController, RunsController, SpellsController],
  providers: [ScanService, WowheadService],
})
export class AppModule {}
