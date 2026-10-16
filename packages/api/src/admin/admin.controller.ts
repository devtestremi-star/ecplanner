import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard.js';
import { AdminService } from './admin.service.js';
import { RESOURCES, type ResourceDef } from './resources.js';

/** Le registre moins les classes d'entités — ce que le front peut consommer. */
const schemaOf = (def: ResourceDef) => ({
  key: def.key,
  table: def.table,
  label: def.label,
  labelPlural: def.labelPlural,
  pivot: def.pivot === true,
  pk: def.pk,
  defaultSort: def.defaultSort,
  description: def.description ?? null,
  fields: def.fields,
});

/**
 * Un contrôleur pour les 9 tables. Tout ce qui les différencie vit dans `resources.ts` ;
 * ici il n'y a que le transport.
 *
 * Protégé par `AdminGuard` (jeton `ADMIN_TOKEN`).
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /** Déclaré avant `:resource` : Nest résout les routes dans l'ordre de déclaration. */
  @Get('schema')
  schema(): unknown {
    return { resources: RESOURCES.map(schemaOf) };
  }

  @Get('stats')
  stats(): unknown {
    return this.admin.stats();
  }

  @Get(':resource/options')
  options(@Param('resource') resource: string, @Query('q') q?: string): unknown {
    return this.admin.options(resource, q ?? '');
  }

  @Get(':resource')
  list(@Param('resource') resource: string, @Query() query: Record<string, unknown>): unknown {
    return this.admin.list(resource, query);
  }

  @Post(':resource')
  create(@Param('resource') resource: string, @Body() body: Record<string, unknown>): unknown {
    return this.admin.create(resource, body ?? {});
  }

  @Get(':resource/:id')
  get(@Param('resource') resource: string, @Param('id') id: string): unknown {
    return this.admin.get(resource, id);
  }

  @Patch(':resource/:id')
  update(
    @Param('resource') resource: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): unknown {
    return this.admin.update(resource, id, body ?? {});
  }

  @Delete(':resource/:id')
  remove(@Param('resource') resource: string, @Param('id') id: string): unknown {
    return this.admin.remove(resource, id);
  }
}
