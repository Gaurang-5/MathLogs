import { Response } from 'express';
import PDFDocument from 'pdfkit';
import { addMathLogsHeader } from '../utils/pdfUtils';

export interface DefaulterStudent {
    humanId: string;
    name: string;
    batch: string;
    phone: string;
    oldestDue: Date;
    balance: number;
}

export interface FeeTransactionRecord {
    date: Date | string;
    id: string;
    name: string;
    batch: string;
    type: string;
    amount: number;
}

/**
 * Streams a styled PDF for Pending Dues Report
 */
export const streamPendingFeesReportPdf = (
    res: Response,
    defaulters: DefaulterStudent[],
    sortBy: string
) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=pending_fees_report.pdf');

    doc.pipe(res);

    // MathLogs branding header
    addMathLogsHeader(doc, 30);
    doc.moveDown(2);

    // Document Title
    doc.fontSize(18).text('Pending Dues Report', { align: 'center' });
    doc.moveDown(0.5);

    const dateString = new Date().toLocaleDateString();
    doc.fontSize(10).fillColor('gray').text(
        `Generated on: ${dateString} | Sorted by: ${sortBy === 'date' ? 'Oldest Due First' : 'Highest Amount First'}`,
        { align: 'center' }
    );
    doc.fillColor('black');
    doc.moveDown(1.5);

    // Table constants
    const startX = 30;
    const rowHeight = 25;
    let currentY = doc.y;

    const drawPendingBorders = (rectY: number) => {
        doc.save();
        doc.lineWidth(0.5).strokeColor('#D1D5DB');
        doc.rect(startX, rectY, 535, rowHeight).stroke();
        doc.moveTo(startX + 85, rectY).lineTo(startX + 85, rectY + rowHeight).stroke();
        doc.moveTo(startX + 205, rectY).lineTo(startX + 205, rectY + rowHeight).stroke();
        doc.moveTo(startX + 310, rectY).lineTo(startX + 310, rectY + rowHeight).stroke();
        doc.moveTo(startX + 385, rectY).lineTo(startX + 385, rectY + rowHeight).stroke();
        doc.moveTo(startX + 455, rectY).lineTo(startX + 455, rectY + rowHeight).stroke();
        doc.restore();
    };

    const drawPendingFeesHeader = (y: number) => {
        doc.save();
        doc.fillColor('#E5E7EB');
        doc.rect(startX, y - 5, 535, rowHeight).fill();
        doc.restore();

        doc.font('Helvetica-Bold').fontSize(10).fillColor('black');
        doc.text('Student ID', startX + 5, y + 2, { width: 75 });
        doc.text('Student Name', startX + 90, y + 2, { width: 110 });
        doc.text('Batch', startX + 210, y + 2, { width: 95 });
        doc.text('Parent Phone', startX + 315, y + 2, { width: 65 });
        doc.text('Oldest Due', startX + 390, y + 2, { width: 60 });
        doc.text('Amount', startX + 460, y + 2, { width: 70, align: 'right' });

        drawPendingBorders(y - 5);
    };

    drawPendingFeesHeader(currentY);
    currentY += rowHeight;

    let totalPending = 0;

    defaulters.forEach((s) => {
        if (currentY > 750) {
            doc.addPage({ margin: 30, size: 'A4' });
            currentY = 40;
            drawPendingFeesHeader(currentY);
            currentY += rowHeight;
        }

        doc.font('Helvetica').fontSize(9).fillColor('black');
        doc.text(s.humanId, startX + 5, currentY + 7, { width: 75, ellipsis: true });
        doc.text(s.name, startX + 90, currentY + 7, { width: 110, ellipsis: true });
        doc.text(s.batch, startX + 210, currentY + 7, { width: 95, ellipsis: true });
        doc.text(s.phone, startX + 315, currentY + 7, { width: 65, ellipsis: true });
        doc.text(new Date(s.oldestDue).toLocaleDateString(), startX + 390, currentY + 7, { width: 60, ellipsis: true });
        doc.font('Helvetica-Bold').fillColor('red')
            .text(`Rs. ${s.balance.toLocaleString()}`, startX + 460, currentY + 7, { width: 70, align: 'right', ellipsis: true });

        drawPendingBorders(currentY);
        currentY += rowHeight;
        totalPending += s.balance;
    });

    doc.moveDown(1.5);
    currentY = doc.y;

    // Total Footer Row
    if (currentY + rowHeight + 5 > 800) {
        doc.addPage({ margin: 30, size: 'A4' });
        currentY = 40;
    }

    doc.save();
    doc.fillColor('#FEF2F2');
    doc.rect(startX, currentY, 535, rowHeight + 5).fill();
    doc.lineWidth(0.5).strokeColor('#EF4444');
    doc.rect(startX, currentY, 535, rowHeight + 5).stroke();
    doc.restore();

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#B91C1C');
    doc.text(`Total Pending Amount: Rs. ${totalPending.toLocaleString()}`, startX + 10, currentY + 8, { width: 515, align: 'right' });

    doc.end();
};

/**
 * Streams a styled PDF for Monthly Fee Transactions Report
 */
export const streamTransactionsReportPdf = (
    res: Response,
    allTx: FeeTransactionRecord[],
    startDate: Date,
    month: string | number,
    year: string | number
) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Transactions_${month}_${year}.pdf`);

    doc.pipe(res);

    // MathLogs branding header
    addMathLogsHeader(doc, 20);
    doc.moveDown(2);

    // Document Title
    const dateString = `${startDate.toLocaleString('default', { month: 'long' })} ${year}`;
    doc.fontSize(18).text(`Fee Transactions Report`, { align: 'center' });
    doc.moveDown(0.5);

    const totalCollected = allTx.reduce((sum, tx) => sum + tx.amount, 0);
    doc.fontSize(10).fillColor('gray').text(
        `Period: ${dateString} | Total Transactions: ${allTx.length} | Total Collected: Rs. ${totalCollected.toLocaleString()}`,
        { align: 'center' }
    );
    doc.fillColor('black');
    doc.moveDown(1.5);

    // Table Constants
    const startX = 30;
    const rowHeight = 25;
    let currentY = doc.y;

    const drawTableBorders = (rectY: number) => {
        doc.save();
        doc.lineWidth(0.5).strokeColor('#D1D5DB');
        doc.rect(startX, rectY, 535, rowHeight).stroke();
        doc.moveTo(startX + 70, rectY).lineTo(startX + 70, rectY + rowHeight).stroke();
        doc.moveTo(startX + 155, rectY).lineTo(startX + 155, rectY + rowHeight).stroke();
        doc.moveTo(startX + 270, rectY).lineTo(startX + 270, rectY + rowHeight).stroke();
        doc.moveTo(startX + 375, rectY).lineTo(startX + 375, rectY + rowHeight).stroke();
        doc.moveTo(startX + 465, rectY).lineTo(startX + 465, rectY + rowHeight).stroke();
        doc.restore();
    };

    const drawTableHeader = (y: number) => {
        doc.save();
        doc.fillColor('#E5E7EB');
        doc.rect(startX, y - 5, 535, rowHeight).fill();
        doc.restore();

        doc.font('Helvetica-Bold').fontSize(10).fillColor('black');
        doc.text('Date', startX + 5, y + 2, { width: 60 });
        doc.text('ID', startX + 75, y + 2, { width: 75 });
        doc.text('Name', startX + 160, y + 2, { width: 105 });
        doc.text('Batch', startX + 275, y + 2, { width: 95 });
        doc.text('Type', startX + 380, y + 2, { width: 80 });
        doc.text('Amount', startX + 470, y + 2, { width: 60, align: 'right' });

        drawTableBorders(y - 5);
    };

    drawTableHeader(currentY);
    currentY += rowHeight;

    allTx.forEach((tx) => {
        if (currentY > 750) {
            doc.addPage({ margin: 30, size: 'A4' });
            currentY = 40;
            drawTableHeader(currentY);
            currentY += rowHeight;
        }

        doc.font('Helvetica').fontSize(9).fillColor('black');
        doc.text(new Date(tx.date).toLocaleDateString(), startX + 5, currentY + 7, { width: 60, ellipsis: true });
        doc.text(tx.id, startX + 75, currentY + 7, { width: 75, ellipsis: true });
        doc.text(tx.name, startX + 160, currentY + 7, { width: 105, ellipsis: true });
        doc.text(tx.batch, startX + 275, currentY + 7, { width: 95, ellipsis: true });
        doc.text(tx.type, startX + 380, currentY + 7, { width: 80, ellipsis: true });
        doc.font('Helvetica-Bold').fillColor('#059669')
            .text(`Rs.${tx.amount}`, startX + 470, currentY + 7, { width: 60, align: 'right', ellipsis: true });
        doc.fillColor('black');

        drawTableBorders(currentY);
        currentY += rowHeight;
    });

    doc.moveDown(1.5);
    currentY = doc.y;

    // Total Footer Row
    if (currentY + rowHeight + 5 > 800) {
        doc.addPage({ margin: 30, size: 'A4' });
        currentY = 40;
    }

    doc.save();
    doc.fillColor('#ECFDF5');
    doc.rect(startX, currentY, 535, rowHeight + 5).fill();
    doc.lineWidth(0.5).strokeColor('#10B981');
    doc.rect(startX, currentY, 535, rowHeight + 5).stroke();
    doc.restore();

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#047857');
    doc.text(`Total Collected: Rs. ${totalCollected.toLocaleString()}`, startX + 10, currentY + 8, { width: 515, align: 'right' });

    doc.end();
};
