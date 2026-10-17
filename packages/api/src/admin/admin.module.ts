import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { SessionController } from './session.controller.js';
import { ToolsController } from './tools.controller.js';

@Module({
  // Session et tools d'abord : leurs routes ne doivent pas tomber dans `admin/:resource`.
  controllers: [SessionController, ToolsController, AdminController],
  providers: [AdminService],
})
export class AdminModule {}
