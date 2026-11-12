import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/** Users, roles & permissions, audit viewer and read-only settings. */
@Module({ controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
