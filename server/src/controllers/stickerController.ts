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
                const contentX = dividerX + 3; // Reduced padding
                const contentWidth = (x + labelWidth) - contentX - 2;

                // 1. Student Name (Larger & Bolder)
                doc.font('Helvetica-Bold')
                    .fontSize(9) // Increased from 6
                    .fillColor('#000000') // Black for better contrast
                    .text(student.name, contentX, y + 2, {
                        width: contentWidth,
                        height: 10,
                        ellipsis: true,
                        align: 'left'
                    });

                // 2. Marks Field - Maximized for Easy Writing
                const marksAreaY = y + 14; // Push down below name
                const availableHeight = (y + labelHeight) - marksAreaY - 2;

                // Label (Small but clear)
                doc.font('Helvetica-Bold')
                    .fontSize(5)
                    .fillColor('#4B5563') // Gray-600
                    .text('MARKS:', contentX, marksAreaY + 3);

                // Big Digit Boxes
                const marksTextWidth = doc.widthOfString('MARKS:') + 2;
                const boxStartX = contentX + marksTextWidth;

                // Calculate box size to fill remaining width
                // Available width for boxes = total content width - label width - right padding
                const availableWidthForBoxes = contentWidth - marksTextWidth - 7; // -7 for "OCR" text space (increased from -5)
                const numDigits = 3;
                const boxSpacing = 2; // Increased spacing for clarity
                const boxWidth = (availableWidthForBoxes - (boxSpacing * (numDigits - 1))) / numDigits;

                // Ensure boxes are square-ish or rectangular but constrained by height
                // We want them as big as possible
                const boxHeight = availableHeight;

                // Draw digit boxes
                for (let i = 0; i < numDigits; i++) {
                    const boxX = boxStartX + (i * (boxWidth + boxSpacing));

                    // Draw box
                    doc.roundedRect(boxX, marksAreaY, boxWidth, boxHeight, 2)
                        .lineWidth(0.5) // Thicker border
                        .strokeColor('#9CA3AF') // Gray-400 border
                        .stroke();

                    // Add guideline at bottom (dashed or solid)
                    // Solid line at bottom 20%
                    const lineY = marksAreaY + boxHeight - 3;
                    doc.moveTo(boxX + 2, lineY)
                        .lineTo(boxX + boxWidth - 2, lineY)
                        .lineWidth(0.3)
                        .strokeColor('#E5E7EB') // Very light gray guide
                        .stroke();
                }

                // OCR Marker (Vertical at end)
                doc.save();
                // Move text 4pts from edge instead of 2pts to avoid border overlap
                const ocrX = x + labelWidth - 4;
                doc.rotate(-90, { origin: [ocrX, marksAreaY + boxHeight] });
                doc.font('Helvetica')
                    .fontSize(3)
                    .fillColor('#D1D5DB')
                    .text('OCR', ocrX, marksAreaY + boxHeight);
                doc.restore();
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
