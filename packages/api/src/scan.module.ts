import { Module } from '@nestjs/common';
import { ScanService } from './scan.service.js';

/**
 * Le scan, partagé entre le site public (`RunsController`) et l'import de masse de l'admin.
 * UNE instance : sa déduplication en vol (`inFlight`) ne vaut que si tout le monde passe
 * par la même.
 */
@Module({ providers: [ScanService], exports: [ScanService] })
export class ScanModule {}
