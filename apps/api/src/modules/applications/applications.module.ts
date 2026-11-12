import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';

/** Staff onboarding review (list, detail, notes, request info, approve, reject, reopen). */
@Module({ controllers: [ApplicationsController], providers: [ApplicationsService], exports: [ApplicationsService] })
export class ApplicationsModule {}
