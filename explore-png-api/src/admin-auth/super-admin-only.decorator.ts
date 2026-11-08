import { SetMetadata } from '@nestjs/common';

export const SUPER_ADMIN_ONLY = 'admin:super-admin-only';

export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN_ONLY, true);
