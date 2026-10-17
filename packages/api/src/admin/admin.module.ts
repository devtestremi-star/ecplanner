import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { ToolsController } from './tools.controller.js';

@Module({
  // Tools d'abord : `admin/tools/...` ne doit pas tomber dans `admin/:resource/:id`.
  controllers: [ToolsController, AdminController],
  providers: [AdminService],
})
export class AdminModule {}
