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

async function createDispatcher() {
  const email = requiredEnvironmentValue(
    'DISPATCHER_BOOTSTRAP_EMAIL',
  ).toLowerCase();

  const fullName = requiredEnvironmentValue('DISPATCHER_BOOTSTRAP_FULL_NAME');

  const password = requiredEnvironmentValue('DISPATCHER_BOOTSTRAP_PASSWORD');

  if (!email.includes('@')) {
    throw new Error('DISPATCHER_BOOTSTRAP_EMAIL must be a valid email address');
  }

  if (fullName.length < 2 || fullName.length > 100) {
    throw new Error(
      'DISPATCHER_BOOTSTRAP_FULL_NAME must contain 2 to 100 characters',
    );
  }

  if (password.length < 14 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error(
      'DISPATCHER_BOOTSTRAP_PASSWORD must contain at least 14 characters and at most 72 UTF-8 bytes',
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
        role: AdminRole.DISPATCHER,
      },
      select: {
        id: true,
      },
    });

    console.log('Dispatcher created successfully.');
  } finally {
    await prisma.onModuleDestroy();
  }
}

void createDispatcher().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : 'Unknown administrator creation error';

  console.error(`Administrator creation failed: ${message}`);
  process.exitCode = 1;
});
