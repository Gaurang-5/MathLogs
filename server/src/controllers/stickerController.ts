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
        // 84 Labels: 4 columns x 21 rows
        // Label size: 46 x 11 mm
        const cols = 4;
        const rows = 21;
        const mmToPt = 2.83465;
        const labelWidth = 46 * mmToPt;
        const labelHeight = 11 * mmToPt;
        const startX = 10 * mmToPt;
        const startY = 15 * mmToPt;
        const gapX = 2 * mmToPt;
        const gapY = 1 * mmToPt;

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

            // Draw Label Container
            doc.roundedRect(x, y, labelWidth, labelHeight, 2)
                .lineWidth(0.5)
                .strokeColor('#9CA3AF') // Gray-400
                .stroke();

            if (student.humanId) {
                // --- LEFT: QR Code ---
                // Maximize QR size for scannability
                const padding = 2; // pts
                const qrSize = labelHeight - (padding * 2);

                try {
                    const png = await bwipjs.toBuffer({
                        bcid: 'qrcode',
                        text: student.humanId,
                        scale: 4,
                    });

                    // Cast to any/Buffer to avoid TS issues with bwip-js types
                    doc.image(png as any, x + padding, y + padding, {
                        width: qrSize,
                        height: qrSize
                    });
                } catch (err) {
                    console.error('Error generating QR for', student.humanId, err);
                }

                // --- DIVIDER ---
                const dividerX = x + qrSize + (padding * 2);
                doc.moveTo(dividerX, y + 2)
                    .lineTo(dividerX, y + labelHeight - 2)
                    .lineWidth(0.5)
                    .strokeColor('#E5E7EB') // Gray-200
                    .stroke();

                // --- RIGHT: Info & Marks ---
                const contentX = dividerX + 4;
                const contentWidth = (x + labelWidth) - contentX - 2;

                // 1. Student Name (Truncated)
                doc.font('Helvetica')
                    .fontSize(6)
                    .fillColor('#111827') // Gray-900
                    .text(student.name, contentX, y + 3, {
                        width: contentWidth,
                        height: 6,
                        ellipsis: true,
                        align: 'left'
                    });

                // 2. Marks Field
                const marksLabelY = y + labelHeight - 9;

                // Set font before measuring
                doc.font('Helvetica-Bold')
                    .fontSize(6)
                    .fillColor('#000000');

                doc.text('MARKS:', contentX, marksLabelY);

                // Underline/Box for marks
                const marksTextWidth = doc.widthOfString('MARKS:');
                const lineStartX = contentX + marksTextWidth + 2;
                const lineEndX = x + labelWidth - 4;
                const lineY = marksLabelY + 6; // Baseline

                doc.moveTo(lineStartX, lineY)
                    .lineTo(lineEndX, lineY)
                    .lineWidth(0.5)
                    .strokeColor('#000000')
                    .stroke();
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
