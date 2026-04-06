import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    const institutes = await prisma.institute.findMany();
    for (const inst of institutes) {
        if (!inst.slug) {
            const tempSlug = inst.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            // Append short random string to guarantee uniqueness
            const slug = `${tempSlug}-${Math.random().toString(36).substring(2, 6)}`;
            await prisma.institute.update({
                where: { id: inst.id },
                data: { slug, aboutUs: "Welcome to our premier institute! We focus on delivering top quality education and securing the best results for our students. Contact us today to learn more." }
            });
            console.log(`Updated ${inst.name} -> /i/${slug}`);
        }
    }
    console.log("Slugs generation complete.");
}

run().catch(console.error).finally(() => prisma.$disconnect());
