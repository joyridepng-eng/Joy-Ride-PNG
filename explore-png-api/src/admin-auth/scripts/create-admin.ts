import 'dotenv/config';
import { AdminRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

async function createAdmin() {
  const email = requiredEnvironmentValue('ADMIN_BOOTSTRAP_EMAIL').toLowerCase();

  const fullName = requiredEnvironmentValue('ADMIN_BOOTSTRAP_FULL_NAME');

  const password = requiredEnvironmentValue('ADMIN_BOOTSTRAP_PASSWORD');

  if (!email.includes('@')) {
    throw new Error('ADMIN_BOOTSTRAP_EMAIL must be a valid email address');
  }

  if (fullName.length < 2 || fullName.length > 100) {
    throw new Error(
      'ADMIN_BOOTSTRAP_FULL_NAME must contain 2 to 100 characters',
    );
  }

  if (password.length < 14 || password.length > 128) {
    throw new Error(
      'ADMIN_BOOTSTRAP_PASSWORD must contain 14 to 128 characters',
    );
  }

  const prisma = new PrismaService();

  try {
    await prisma.onModuleInit();

    const existingAdmin = await prisma.adminAccount.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingAdmin) {
      throw new Error('An administrator with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.adminAccount.create({
      data: {
        email,
        fullName,
        passwordHash,
        role: AdminRole.SUPER_ADMIN,
      },
      select: {
        id: true,
      },
    });

    console.log('Administrator created successfully.');
  } finally {
    await prisma.onModuleDestroy();
  }
}

void createAdmin().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : 'Unknown administrator creation error';

  console.error(`Administrator creation failed: ${message}`);
  process.exitCode = 1;
});
