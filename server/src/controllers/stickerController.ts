import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { drawStudentQr } from '../utils/stickerQr';

export const generateStickerSheet = async (req: Request, res: Response) => {
    const { batchId } = req.query;
    const user = (req as any).user;
    const teacherId = user?.id;
    const instituteId = user?.instituteId;
    const role = user?.role;
    const PDFDocument = require('pdfkit');

    const whereClause: any = {
        status: 'APPROVED'
    };

    if (instituteId) {
        whereClause.instituteId = instituteId;
    }

    if (role !== 'SUPER_ADMIN') {
        whereClause.batch = { teacherId };
    }

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

        // A4: 210 x 297 mm — physical sticker sheet measurements:
        //   Label size:    3.9 cm wide × 2.1 cm tall
        //   Top margin:    1.3 cm
        //   Bottom margin: 1.1 cm
        //   Column gap:    0.2 cm (between columns)
        //   Row gap:       0     (rows are flush/continuous)
        //   Columns: 5, Rows: 13 → 65 labels per sheet
        //
        //   Total width used: 5×39 + 4×2 = 203 mm; left margin 3 mm, right margin 4 mm.
        const cols = 5;
        const rows = 13;
        const mmToPt = 2.83465;

        const labelWidth = 39 * mmToPt;   // 3.9 cm exact
        const labelHeight = 21 * mmToPt;   // 2.1 cm exact
        const gapX = 2 * mmToPt;   // 0.2 cm column gap
        const gapY = 0;             // no row gap

        const startX = 3 * mmToPt;   // 0.3cm left margin (physical sheet measurement)
        const startY = 13 * mmToPt;  // 1.3cm top margin

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

            // Draw Label Container — corner radius matches physical sticker curve (~2mm)
            const cornerR = 2 * mmToPt; // 2mm corner radius
            doc.roundedRect(x, y, labelWidth, labelHeight, cornerR)
                .lineWidth(0.5)
                .strokeColor('#9CA3AF') // Gray-400
                .stroke();

            // Manual capture needs no corner markers; leave the QR margin clear.
            if (student.humanId) {
                // Full-width name header inside the existing sticker boundary.
                // Wrap and fit the complete name; never clip it or replace it with ellipsis.
                const nameX = x + 3;
                const nameWidth = labelWidth - 6;
                const nameHeight = 11;
                let nameFontSize = 7;
                doc.font('Helvetica-Bold').fontSize(nameFontSize);
                while (doc.heightOfString(student.name, { width: nameWidth }) > nameHeight && nameFontSize > 0.5) {
                    nameFontSize -= 0.25;
                    doc.fontSize(nameFontSize);
                }
                doc.fillColor('#000000').text(student.name, nameX, y + 2, {
                    width: nameWidth,
                    align: 'center',
                });

                // QR and writing box sit below the name, with the same outer label geometry.
                const padding = 2;
                const bodyY = y + 19;
                const bodyBottom = y + labelHeight - padding;
                // Keep the actual black QR symbol at least as large as before;
                // adding a quiet zone must not shrink its modules.
                const qrSize = 43;
                const qrY = bodyBottom - qrSize;

                try {
                    drawStudentQr(doc, student.humanId, x + padding, qrY, qrSize);
                } catch (err) {
                    console.error('Error generating QR for', student.humanId, err);
                }

                const contentX = x + padding + qrSize + 3;
                const boxRight = x + labelWidth - cornerR - 2;
                // One uninterrupted writing area, without a label, dividers, or guidelines.
                const marksAreaY = bodyY;
                const boxBottom = bodyBottom;
                doc.roundedRect(contentX, marksAreaY, boxRight - contentX, boxBottom - marksAreaY, 2)
                    .lineWidth(0.5)
                    .strokeColor('#9CA3AF')
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
