import { Request, Response } from 'express';
import { prisma } from '../prisma';
import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';

export const generateStickerSheet = async (req: Request, res: Response) => {
    const { batchId } = req.query;
    const teacherId = (req as any).user?.id;
    const whereClause: any = {
        status: 'APPROVED',
        batch: { teacherId }
    };
    if (batchId) {
        whereClause.batchId = String(batchId);
    }

    try {
        const students = await prisma.student.findMany({
            where: whereClause,
            orderBy: { name: 'asc' }
        });

        if (students.length === 0) {
            res.status(400).send('No approved students found');
            return;
        }

        const doc = new PDFDocument({
            size: 'A4',
            margin: 0
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=stickers.pdf');
        doc.pipe(res);

        // A4: 210 x 297 mm
        // 84 Labels: 4 columns x 21 rows? 
        // Requirement: 84 labels per A4. 
        // Label size: 46 x 11 mm.
        // 4 cols * 46 = 184mm. (26mm margin left)
        // 21 rows * 11 = 231mm. (66mm margin left) -> This fits easily.

        // Grid Configuration
        const cols = 4;
        const rows = 21;
        const labelWidth = 46 * 2.83465; // mm to points (1mm = 2.83465pt)
        const labelHeight = 11 * 2.83465;
        const startX = 10 * 2.83465; // Left margin
        const startY = 15 * 2.83465; // Top margin
        const gapX = 2 * 2.83465; // Horizontal gap
        const gapY = 1 * 2.83465; // Vertical gap

        let col = 0;
        let row = 0;

        for (const student of students) {
            if (row >= rows) {
                doc.addPage();
                col = 0;
                row = 0;
            }

            const x = startX + (col * (labelWidth + gapX));
            const y = startY + (row * (labelHeight + gapY));

            // Draw Label
            // Generate Barcode Buffer
            if (student.humanId) {
                const png = await bwipjs.toBuffer({
                    bcid: 'code128',       // Barcode type
                    text: student.humanId, // Text to encode
                    scale: 2,              // 3x scaling factor
                    height: 5,             // Bar height, in millimeters
                    includetext: false,    // Show human-readable text
                    textxalign: 'center',  // Always good to set this
                });

                doc.image(png, x + 5, y + 2, { width: labelWidth - 10, height: labelHeight - 12 });

                doc.fontSize(7)
                    .text(student.name.substring(0, 20), x, y + labelHeight - 8, {
                        width: labelWidth,
                        align: 'center'
                    });
            }

            col++;
            if (col >= cols) {
                col = 0;
                row++;
            }
        }

        doc.end();

    } catch (e) {
        console.error(e);
        res.status(500).send('Error generating PDF');
    }
};
