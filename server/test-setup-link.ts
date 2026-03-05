import { prisma } from './src/prisma';

async function main() {
    const institute = await prisma.institute.create({
        data: {
            name: "Apex Math Local Test",
            teacherName: "Test Owner",
            phoneNumber: "1357908642",
            email: "test@example.com",
            plan: "PRO",
            config: {
                requiresGrades: true,
                maxClasses: 12,
                maxBatches: 250,
                maxBatchesPerClass: 100,
                allowedClasses: ["Class 6", "Class 7", "Class 8"],
                subjects: ["Math"]
            }
        }
    });

    const tokenString = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    const invite = await prisma.inviteToken.create({
        data: {
            token: tokenString,
            instituteId: institute.id,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
    });

    console.log(`\n\n✅ TEST SETUP LINK GENERATED:`);
    console.log(`http://localhost:5173/setup?token=${invite.token}\n\n`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
