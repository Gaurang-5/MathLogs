import { prisma } from '../src/prisma';

async function main() {
    const jobs = await prisma.whatsappJob.findMany({
        where: {
            status: 'FAILED',
            templateId: 'fee_breakup_alert_1',
            instituteId: '43061add-0e7a-4d76-afe2-260e1b587b14'
        }
    });

    console.log(`Found ${jobs.length} failed jobs. Fixing...`);

    let fixedCount = 0;
    for (const job of jobs) {
        const data = job.data as string[];
        if (data.length === 5) {
            // Reconstruct array to have 6 elements
            const newData = [
                data[0],
                data[1],
                data[2],
                data[3],
                "Please contact admin for payment details.",
                data[4]
            ];

            await prisma.whatsappJob.update({
                where: { id: job.id },
                data: {
                    data: newData,
                    status: 'PENDING',
                    attempts: 0,
                    error: null
                }
            });
            fixedCount++;
        }
    }
    
    console.log(`Successfully fixed and re-queued ${fixedCount} jobs.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
