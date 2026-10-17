import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard.js';
import { type CreateBatchInput, ImportsService } from './imports.service.js';

/** Admin > Tools > Mass import. Même garde que le reste de l'admin. */
@Controller('admin/tools/imports')
@UseGuards(AdminGuard)
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  list(): Promise<unknown> {
    return this.imports.list();
  }

  /** Déclaré avant `:id`. */
  @Get('options')
  options(): Promise<unknown> {
    return this.imports.options();
  }

  @Post()
  create(@Body() body: CreateBatchInput): Promise<{ id: number; found: number }> {
    return this.imports.create(body ?? ({} as CreateBatchInput));
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number): Promise<unknown> {
    return this.imports.get(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string | null; healerSpecId?: number | null },
  ): Promise<unknown> {
    return this.imports.update(id, body ?? {});
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.imports.remove(id);
  }

  @Post(':id/candidates/:cid/import')
  @HttpCode(200)
  importCandidate(
    @Param('id', ParseIntPipe) id: number,
    @Param('cid', ParseIntPipe) cid: number,
  ): Promise<{ ok: boolean; error?: string }> {
    return this.imports.importCandidate(id, cid);
  }

  @Delete(':id/candidates/:cid')
  @HttpCode(204)
  removeCandidate(@Param('id', ParseIntPipe) id: number, @Param('cid', ParseIntPipe) cid: number): Promise<void> {
    return this.imports.removeCandidate(id, cid);
  }
}
