import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const admin = await prisma.admin.findFirst({ where: { institute: { isNot: null } }, include: { institute: true } });
    if (!admin) return console.log("No admin");
    console.log("Current config:", admin.institute?.config);
    
    let config = admin.institute?.config as any || {};
    config.registrationForm = {
        fields: [
            { id: "test", label: "test", type: "text", required: true, system: false }
        ]
    };
    
    try {
        await prisma.institute.update({
            where: { id: admin.institute!.id },
            data: { config }
        });
        console.log("Success");
    } catch (e) {
        console.error("Prisma Error:", e);
    }
}
main().finally(() => prisma.$disconnect());
