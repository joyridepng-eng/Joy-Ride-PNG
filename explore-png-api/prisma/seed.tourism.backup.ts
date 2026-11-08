import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is missing. Check your .env file.');
  }

  const adapter = new PrismaPg({
    connectionString,
  });

  const prisma = new PrismaClient({
    adapter,
  });

  const ncd = await prisma.province.upsert({
    where: {
      slug: 'national-capital-district',
    },
    update: {
      name: 'National Capital District',
      description:
        'The National Capital District is home to Port Moresby, the capital city of Papua New Guinea.',
    },
    create: {
      name: 'National Capital District',
      slug: 'national-capital-district',
      description:
        'The National Capital District is home to Port Moresby, the capital city of Papua New Guinea.',
    },
  });

  const portMoresby = await prisma.location.upsert({
    where: {
      provinceId_slug: {
        provinceId: ncd.id,
        slug: 'port-moresby',
      },
    },
    update: {
      name: 'Port Moresby',
      description:
        'Port Moresby is the capital city of Papua New Guinea and the starting location for Explore PNG.',
    },
    create: {
      name: 'Port Moresby',
      slug: 'port-moresby',
      description:
        'Port Moresby is the capital city of Papua New Guinea and the starting location for Explore PNG.',
      provinceId: ncd.id,
    },
  });

  await prisma.destination.upsert({
    where: {
      provinceId_slug: {
        provinceId: ncd.id,
        slug: 'port-moresby-nature-park',
      },
    },
    update: {
      name: 'Port Moresby Nature Park',
      description:
        'A leading nature and wildlife attraction in Port Moresby, featuring PNG plants, animals, walking paths, and family-friendly experiences.',
      address: 'Port Moresby, National Capital District',
      featured: true,
      published: true,
      locationId: portMoresby.id,
    },
    create: {
      name: 'Port Moresby Nature Park',
      slug: 'port-moresby-nature-park',
      description:
        'A leading nature and wildlife attraction in Port Moresby, featuring PNG plants, animals, walking paths, and family-friendly experiences.',
      address: 'Port Moresby, National Capital District',
      featured: true,
      published: true,
      provinceId: ncd.id,
      locationId: portMoresby.id,
    },
  });

  await prisma.destination.upsert({
    where: {
      provinceId_slug: {
        provinceId: ncd.id,
        slug: 'ela-beach',
      },
    },
    update: {
      name: 'Ela Beach',
      description:
        'Ela Beach is a popular beachfront area in Port Moresby for walking, relaxing, events, and coastal views.',
      address: 'Ela Beach, Port Moresby',
      featured: true,
      published: true,
      locationId: portMoresby.id,
    },
    create: {
      name: 'Ela Beach',
      slug: 'ela-beach',
      description:
        'Ela Beach is a popular beachfront area in Port Moresby for walking, relaxing, events, and coastal views.',
      address: 'Ela Beach, Port Moresby',
      featured: true,
      published: true,
      provinceId: ncd.id,
      locationId: portMoresby.id,
    },
  });

  await prisma.experience.upsert({
    where: {
      provinceId_slug: {
        provinceId: ncd.id,
        slug: 'port-moresby-city-highlights-tour',
      },
    },
    update: {
      title: 'Port Moresby City Highlights Tour',
      description:
        'A guided city experience covering key Port Moresby landmarks, culture, coastal views, and local stories.',
      priceFrom: 150,
      duration: 'Half day',
      featured: true,
      published: true,
      locationId: portMoresby.id,
    },
    create: {
      title: 'Port Moresby City Highlights Tour',
      slug: 'port-moresby-city-highlights-tour',
      description:
        'A guided city experience covering key Port Moresby landmarks, culture, coastal views, and local stories.',
      priceFrom: 150,
      duration: 'Half day',
      featured: true,
      published: true,
      provinceId: ncd.id,
      locationId: portMoresby.id,
    },
  });

  await prisma.$disconnect();

  console.log('Seed data loaded successfully.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});