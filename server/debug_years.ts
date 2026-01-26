
import { prisma } from './src/prisma';

async function main() {
    try {
        const years = await prisma.academicYear.findMany({
            where: { teacherId: 'e7c19567-add0-43fe-9312-31909f968971' },
            orderBy: { startDate: 'desc' }
        });
        console.log('Years found:', JSON.stringify(years, null, 2));
    } catch (e) {
        console.error('Error:', e);
    }
}

main();
