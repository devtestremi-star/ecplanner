import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { DbExceptionFilter } from './db-exception.filter.js';

@Module({
  controllers: [AdminController],
  providers: [
    AdminService,
    // Traduit les violations de contrainte en 409/400 lisibles plutôt qu'en 500 muet.
    { provide: APP_FILTER, useClass: DbExceptionFilter },
  ],
})
export class AdminModule {}
