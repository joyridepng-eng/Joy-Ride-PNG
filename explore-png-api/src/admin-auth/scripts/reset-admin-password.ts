import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

async function resetAdminPassword() {
  const email = requiredEnvironmentValue('ADMIN_BOOTSTRAP_EMAIL').toLowerCase();

  const password = requiredEnvironmentValue('ADMIN_BOOTSTRAP_PASSWORD');

  if (password.length < 14 || password.length > 128) {
    throw new Error(
      'ADMIN_BOOTSTRAP_PASSWORD must contain 14 to 128 characters',
    );
  }

  const prisma = new PrismaService();

  try {
    await prisma.onModuleInit();

    const admin = await prisma.adminAccount.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        isActive: true,
      },
    });

    if (!admin) {
      throw new Error('No administrator exists with this email');
    }

    if (!admin.isActive) {
      throw new Error('This administrator account is inactive');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.adminAccount.update({
      where: { id: admin.id },
      data: {
        passwordHash,
        tokenVersion: {
          increment: 1,
        },
      },
    });

    console.log('Administrator password reset successfully.');
  } finally {
    await prisma.onModuleDestroy();
  }
}

void resetAdminPassword().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unknown password-reset error';

  console.error(`Administrator password reset failed: ${message}`);

  process.exitCode = 1;
});
