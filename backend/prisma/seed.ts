import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await Promise.all([
    prisma.currency.upsert({ where: { code: 'USD' }, update: { isActive: true }, create: { code: 'USD', name: 'Dólar estadounidense', symbol: '$', isActive: true } }),
    prisma.currency.upsert({ where: { code: 'COP' }, update: { isActive: true }, create: { code: 'COP', name: 'Peso colombiano', symbol: '$', isActive: true } }),
    prisma.currency.upsert({ where: { code: 'EUR' }, update: { isActive: true }, create: { code: 'EUR', name: 'Euro', symbol: '€', isActive: true } }),
    prisma.currency.upsert({ where: { code: 'GBP' }, update: { isActive: true }, create: { code: 'GBP', name: 'Libra esterlina', symbol: '£', isActive: true } }),
  ]);

  await Promise.all([
    prisma.broker.upsert({
      where: { slug: 'hapi' },
      update: { name: 'Hapi', isActive: true, metadata: { emailImport: true, documentPassword: false } },
      create: { id: '10000000-0000-4000-8000-000000000001', slug: 'hapi', name: 'Hapi', isActive: true, metadata: { emailImport: true, documentPassword: false } },
    }),
    prisma.broker.upsert({
      where: { slug: 'xtb' },
      update: { name: 'XTB', isActive: true, metadata: { emailImport: true, documentPassword: true } },
      create: { id: '10000000-0000-4000-8000-000000000002', slug: 'xtb', name: 'XTB', isActive: true, metadata: { emailImport: true, documentPassword: true } },
    }),
  ]);

  console.log('Catálogos de monedas y brokers listos. No se crearon datos de demostración.');
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(async () => prisma.$disconnect());

