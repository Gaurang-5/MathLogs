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

        // A4: 210 x 297 mm — physical sticker sheet measurements:
        //   Label size:    3.9 cm wide × 2.0 cm tall  (exact, from physical sheet)
        //   Top margin:    1.2 cm
        //   Bottom margin: 1.2 cm
        //   Column gap:    0.2 cm (between columns)
        //   Row gap:       0     (rows are flush/continuous)
        //   Columns: 5, Rows: 13 → 65 labels per sheet
        //
        //   Total width used: 5×39 + 4×2 = 203 mm → left/right margin = (210-203)/2 = 3.5 mm each
        const cols = 5;
        const rows = 13;
        const mmToPt = 2.83465;

        const labelWidth = 39 * mmToPt;   // 3.9 cm exact
        const labelHeight = 21 * mmToPt;   // 2.1 cm exact
        const gapX = 2 * mmToPt;   // 0.2 cm column gap
        const gapY = 0;             // no row gap

        const pageWidth = 210 * mmToPt;
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

            // --- Fiducial Markers for CV (L-shapes at corners) ---
            // IMPORTANT: Sticker has rounded corners. L-markers are inset by `cornerR`
            // so their reference points sit on FLAT straight edges, not inside the curve.
            // OCR detects the inner corner of each L as the sticker corner reference.
            const markerLen = 3 * mmToPt; // 3mm leg length
            const markerWidth = 1.5;      // line thickness (pts)

            doc.lineWidth(markerWidth).strokeColor('#000000');

            // Top-Left:    L corner at (x+cornerR, y+cornerR)
            doc.moveTo(x + cornerR + markerLen, y + cornerR)
                .lineTo(x + cornerR, y + cornerR)
                .lineTo(x + cornerR, y + cornerR + markerLen)
                .stroke();

            // Top-Right:   L corner at (x+w-cornerR, y+cornerR)
            doc.moveTo(x + labelWidth - cornerR - markerLen, y + cornerR)
                .lineTo(x + labelWidth - cornerR, y + cornerR)
                .lineTo(x + labelWidth - cornerR, y + cornerR + markerLen)
                .stroke();

            // Bottom-Right: L corner at (x+w-cornerR, y+h-cornerR)
            doc.moveTo(x + labelWidth - cornerR, y + labelHeight - cornerR - markerLen)
                .lineTo(x + labelWidth - cornerR, y + labelHeight - cornerR)
                .lineTo(x + labelWidth - cornerR - markerLen, y + labelHeight - cornerR)
                .stroke();

            // Bottom-Left: L corner at (x+cornerR, y+h-cornerR)
            doc.moveTo(x + cornerR, y + labelHeight - cornerR - markerLen)
                .lineTo(x + cornerR, y + labelHeight - cornerR)
                .lineTo(x + cornerR + markerLen, y + labelHeight - cornerR)
                .stroke();

            if (student.humanId) {
                // --- LEFT: QR Code ---
                // Inset by cornerR so QR stays clear of the rounded-corner curved region.
                // Label height = 20mm = 56.7pt. qrSize=34pt → 11pt margin top/bottom (3.9mm).
                const padding = cornerR + 2; // start past the rounded corner
                const qrSize = 34;           // 12mm — comfortably fits 20mm label height
                const qrY = y + (labelHeight - qrSize) / 2; // vertically centered

                try {
                    const png = await bwipjs.toBuffer({
                        bcid: 'qrcode',
                        text: student.humanId,
                        scale: 3,
                    });

                    doc.image(png as any, x + padding, qrY, {
                        width: qrSize,
                        height: qrSize
                    });
                } catch (err) {
                    console.error('Error generating QR for', student.humanId, err);
                }

                // --- DIVIDER ---
                const dividerX = x + padding + qrSize + 2;
                doc.moveTo(dividerX, y + 2)
                    .lineTo(dividerX, y + labelHeight - 2)
                    .lineWidth(0.5)
                    .strokeColor('#E5E7EB') // Gray-200
                    .stroke();

                // --- RIGHT: Info & Marks ---
                const contentX = dividerX + 3;
                const contentWidth = (x + labelWidth) - contentX - 2;

                // 1. Student Name — single line, ellipsis if too long
                // lineBreak:false forces PDFKit to clip at width boundary with ellipsis
                // Font 6.5 → ~3.8pt/char → 62pt content area fits ~16 chars cleanly
                const nameFontSize = 6.5;
                const nameLineHeight = 11; // pts — single line cap
                const nameTopPad = 3;

                doc.font('Helvetica-Bold')
                    .fontSize(nameFontSize)
                    .fillColor('#000000')
                    .text(student.name, contentX, y + nameTopPad, {
                        width: contentWidth,
                        height: nameLineHeight,
                        ellipsis: true,
                        lineBreak: false,
                        align: 'left'
                    });

                // MARKS — positioned dynamically below the name (never overlaps)
                const labelY = y + nameTopPad + nameLineHeight + 2;



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
