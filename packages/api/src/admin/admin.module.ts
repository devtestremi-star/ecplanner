import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';
import { ScanModule } from '../scan.module.js';
import { SessionController } from './session.controller.js';
import { ToolsController } from './tools.controller.js';

@Module({
  imports: [ScanModule],
  // Session et tools d'abord : leurs routes ne doivent pas tomber dans `admin/:resource`.
  controllers: [SessionController, ToolsController, ImportsController, AdminController],
  providers: [AdminService, ImportsService],
})
export class AdminModule {}
