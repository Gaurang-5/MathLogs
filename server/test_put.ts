import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

async function main() {
    const admin = await prisma.admin.findFirst({ where: { institute: { isNot: null } } });
    if (!admin) return console.log("No admin");

    const token = jwt.sign({ id: admin.id, role: admin.role }, JWT_SECRET, { expiresIn: '7d' });

    console.log("Making PUT request...");
    const res = await fetch('http://localhost:3001/api/institute/me/config', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            registrationForm: {
                fields: [
                    { id: 'test', label: 'test', type: 'text', required: true, system: false }
                ]
            }
        })
    });

    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text);
}

main().finally(() => prisma.$disconnect());
