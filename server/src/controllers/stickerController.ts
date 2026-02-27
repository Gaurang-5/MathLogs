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

        // A4: 210 x 297 mm → 595.28 x 841.89 pts
        // Physical sheet layout (measured from delivered sticker sheet):
        //   Top margin:    1.2 cm = 12 mm
        //   Bottom margin: 1.2 cm = 12 mm
        //   Column gap:    0.2 cm =  2 mm  (between columns)
        //   Row gap:       0      (rows are continuous, no gap)
        //   Columns: 5, Rows: 13  → 65 labels per sheet
        //
        // Derived label dimensions:
        //   Width:  (210 - 4 × 2) / 5  = 202 / 5  = 40.4 mm
        //   Height: (297 - 12 - 12) / 13 = 273 / 13 ≈ 21.0 mm
        const cols = 5;
        const rows = 13;
        const mmToPt = 2.83465;

        const topMargin = 12 * mmToPt;   // 1.2 cm
        const gapX = 2 * mmToPt;   // 0.2 cm column gap
        const gapY = 0;             // no row gap

        const pageWidth = 210 * mmToPt;    // A4 width  in pts
        const pageHeight = 297 * mmToPt;    // A4 height in pts

        const labelWidth = (pageWidth - (cols - 1) * gapX) / cols;
        const labelHeight = (pageHeight - 2 * topMargin) / rows;  // top + bottom = 1.2cm each

        const startX = 0;           // labels start at left edge (no left margin on this sheet)
        const startY = topMargin;   // labels start after the 1.2cm top margin

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

            // --- Fiducial Markers for CV (L-shapes at corners) ---
            const markerLen = 3 * mmToPt; // 3mm length
            const markerWidth = 1.5; // Thicker line for visibility

            doc.lineWidth(markerWidth).strokeColor('#000000');

            // Top-Left
            doc.moveTo(x, y + markerLen).lineTo(x, y).lineTo(x + markerLen, y).stroke();
            // Top-Right
            doc.moveTo(x + labelWidth - markerLen, y).lineTo(x + labelWidth, y).lineTo(x + labelWidth, y + markerLen).stroke();
            // Bottom-Right
            doc.moveTo(x + labelWidth, y + labelHeight - markerLen).lineTo(x + labelWidth, y + labelHeight).lineTo(x + labelWidth - markerLen, y + labelHeight).stroke();
            // Bottom-Left
            doc.moveTo(x + markerLen, y + labelHeight).lineTo(x, y + labelHeight).lineTo(x, y + labelHeight - markerLen).stroke();

            if (student.humanId) {
                // --- LEFT: QR Code ---
                // Keeping QR code sized appropriately (~14mm = 40pts) for easy scanning
                const padding = 2; // pts
                const qrSize = 40;
                const qrY = y + (labelHeight - qrSize) / 2; // vertically centered

                try {
                    const png = await bwipjs.toBuffer({
                        bcid: 'qrcode',
                        text: student.humanId,
                        scale: 4,
                    });

                    // Cast to any/Buffer to avoid TS issues with bwip-js types
                    doc.image(png as any, x + padding, qrY, {
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
                    .fontSize(9) // Size 9 to fit 2 lines if needed
                    .fillColor('#000000') // Black for better contrast
                    .text(student.name, contentX, y + 3, {
                        width: contentWidth,
                        height: 22,
                        ellipsis: true,
                        align: 'center'
                    });

                // 2. Marks Field - Maximized for Easy Writing
                // Because we have 23mm height, we can stack MARKS above the boxes
                const labelY = y + 25; // Below the name

                doc.font('Helvetica-Bold')
                    .fontSize(6)
                    .fillColor('#4B5563') // Gray-600
                    .text('MARKS:', contentX, labelY);

                const marksAreaY = labelY + 8; // Push down below label
                const availableHeight = (y + labelHeight) - marksAreaY - 4; // Padding to bottom

                // Big Digit Boxes
                // Fill the row
                const availableWidthForBoxes = contentWidth - 10; // -10 for "OCR" text on the right edge
                const boxStartX = contentX + 2;
                const numDigits = 3;
                const boxSpacing = 3;
                const boxWidth = (availableWidthForBoxes - (boxSpacing * (numDigits - 1))) / numDigits;

                // Box height up to 1.5x width to avoid weird slim shapes
                const boxHeight = Math.min(availableHeight, boxWidth * 1.5);
                const actualMarksY = marksAreaY + (availableHeight - boxHeight) / 2; // Center vertically in space

                // Draw digit boxes
                for (let i = 0; i < numDigits; i++) {
                    const boxX = boxStartX + (i * (boxWidth + boxSpacing));

                    // Draw box
                    doc.roundedRect(boxX, actualMarksY, boxWidth, boxHeight, 2)
                        .lineWidth(0.5) // Thicker border
                        .strokeColor('#9CA3AF') // Gray-400 border
                        .stroke();

                    // Add guideline at bottom (dashed or solid)
                    // Solid line at bottom 20%
                    const lineY = actualMarksY + boxHeight - 3;
                    doc.moveTo(boxX + 2, lineY)
                        .lineTo(boxX + boxWidth - 2, lineY)
                        .lineWidth(0.3)
                        .strokeColor('#E5E7EB') // Very light gray guide
                        .stroke();
                }

                // OCR Marker (Vertical at end)
                doc.save();
                // Move text 4pts from edge to avoid border overlap
                const ocrX = x + labelWidth - 4;
                doc.rotate(-90, { origin: [ocrX, actualMarksY + boxHeight] });
                doc.font('Helvetica')
                    .fontSize(3)
                    .fillColor('#D1D5DB')
                    .text('OCR', ocrX, actualMarksY + boxHeight);
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
