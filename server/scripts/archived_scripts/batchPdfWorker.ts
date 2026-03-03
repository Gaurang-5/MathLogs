/**
 * workers/batchPdfWorker.ts
 *
 * Runs in a worker_thread. Receives serialized batch data via workerData,
 * generates the PDF synchronously (PDFKit) and sends the Buffer back to the main thread.
 *
 * This file must be compiled standalone by ts-node or compiled to JS.
 * The main thread calls it via runPdfInWorker(path.resolve(__dirname, './batchPdfWorker.js'), data).
 */

import { parentPort, workerData } from 'worker_threads';
import PDFDocument from 'pdfkit';

// Inline the header utility to avoid cross-thread import issues
function addMathLogsHeader(doc: PDFKit.PDFDocument, x: number) {
    doc.save();
    try {
        doc.fontSize(10).fillColor('#4F46E5')
            .text('MathLogs', x, doc.y, { continued: false });
        doc.fillColor('black');
    } catch { /* non-critical */ } finally {
        doc.restore();
    }
}

interface BatchPdfData {
    batch: {
        name: string;
        subject: string | null;
        feeAmount: number;
        feeInstallments: Array<{ id: string; name: string; amount: number; createdAt: string }>;
        students: Array<{
            name: string;
            schoolName: string | null;
            parentWhatsapp: string | null;
            humanId: string | null;
            marks: Array<{ score: number }>;
            feePayments: Array<{ installmentId: string; amountPaid: number; date: string }>;
            fees: Array<{ amount: number; status: string }>;
        }>;
    };
}

async function generate(data: BatchPdfData): Promise<Buffer> {
    const { batch } = data;
    const installments = batch.feeInstallments || [];
    const numInstallments = installments.length;

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 20 });
    const chunks: Buffer[] = [];

    doc.on('data', chunk => chunks.push(chunk));

    return new Promise((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        addMathLogsHeader(doc, 20);
        doc.moveDown(2);

        doc.fontSize(16).font('Helvetica-Bold')
            .text(`${batch.name} - Fee Payment Details`, { align: 'center' });
        doc.fontSize(9).font('Helvetica')
            .text(`Subject: ${batch.subject} | Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
        doc.moveDown(0.8);

        const startX = 20;
        const nameWidth = 70;
        const schoolWidth = 60;
        const phoneWidth = 55;
        const avgWidth = 30;
        const feeDueWidth = 40;
        const remainingWidth = 800 - nameWidth - schoolWidth - phoneWidth - avgWidth - feeDueWidth - 50;
        const installmentWidth = Math.max(40, Math.floor(remainingWidth / Math.max(numInstallments, 1)));

        const drawHeaders = (y: number) => {
            doc.font('Helvetica-Bold').fontSize(7);
            let x = startX;
            doc.text('Name', x, y, { width: nameWidth }); x += nameWidth + 5;
            doc.text('School', x, y, { width: schoolWidth }); x += schoolWidth + 5;
            doc.text('Phone', x, y, { width: phoneWidth }); x += phoneWidth + 5;
            doc.text('Avg%', x, y, { width: avgWidth }); x += avgWidth + 5;
            installments.forEach(inst => {
                const instName = inst.name.length > 8 ? inst.name.substring(0, 7) + '.' : inst.name;
                doc.text(instName, x, y, { width: installmentWidth, align: 'center' });
                x += installmentWidth + 2;
            });
            doc.text('Due', x, y, { width: feeDueWidth, align: 'center' });
        };

        let currentY = doc.y;
        drawHeaders(currentY);
        doc.moveDown(0.2)
            .moveTo(startX, doc.y).lineTo(startX + 780, doc.y).stroke()
            .moveDown(0.3);

        batch.students.forEach(student => {
            currentY = doc.y;
            if (currentY > 510) {
                doc.addPage({ layout: 'landscape' });
                currentY = 40;
                drawHeaders(currentY);
                doc.moveDown(0.2).moveTo(startX, doc.y).lineTo(startX + 780, doc.y).stroke().moveDown(0.3);
                currentY = doc.y;
            }

            const avgMarks = student.marks.length > 0
                ? Math.round(student.marks.reduce((s, m) => s + m.score, 0) / student.marks.length)
                : 0;

            let totalDue = 0;
            if (installments.length > 0) {
                const totalExpected = installments.reduce((s, i) => s + i.amount, 0);
                const totalPaidFromPayments = student.feePayments.reduce((s, p) => s + p.amountPaid, 0);
                const totalPaidFromFees = student.fees.filter(f => f.status === 'PAID').reduce((s, f) => s + f.amount, 0);
                totalDue = Math.max(0, totalExpected - totalPaidFromPayments - totalPaidFromFees);
            } else {
                const totalExpected = batch.feeAmount || 0;
                const totalPaid = student.fees.filter(f => f.status === 'PAID').reduce((s, f) => s + f.amount, 0)
                    + student.feePayments.reduce((s, p) => s + p.amountPaid, 0);
                totalDue = Math.max(0, totalExpected - totalPaid);
            }

            doc.font('Helvetica').fontSize(6.5).fillColor('black');
            let x = startX;
            doc.text(student.name || '-', x, currentY, { width: nameWidth, ellipsis: true }); x += nameWidth + 5;
            doc.text(student.schoolName || 'N/A', x, currentY, { width: schoolWidth, ellipsis: true }); x += schoolWidth + 5;
            doc.text(student.parentWhatsapp || '-', x, currentY, { width: phoneWidth }); x += phoneWidth + 5;
            doc.text(avgMarks > 0 ? `${avgMarks}%` : '-', x, currentY, { width: avgWidth, align: 'center' }); x += avgWidth + 5;

            if (installments.length > 0) {
                installments.forEach(inst => {
                    const paymentsForThis = student.feePayments.filter(p => p.installmentId === inst.id);
                    const totalPaid = paymentsForThis.reduce((s, p) => s + p.amountPaid, 0);
                    const due = inst.amount - totalPaid;

                    if (totalPaid >= inst.amount - 0.01) {
                        const latestPayment = [...paymentsForThis].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                        const payDate = new Date(latestPayment.date);
                        const month = (payDate.getMonth() + 1).toString().padStart(2, '0');
                        const day = payDate.getDate().toString().padStart(2, '0');
                        doc.fillColor('green').text(`${day}/${month}`, x, currentY, { width: installmentWidth, align: 'center' });
                    } else if (totalPaid > 0) {
                        doc.fillColor('orange').fontSize(5.5).text(`₹${Math.round(due)}`, x, currentY, { width: installmentWidth, align: 'center' });
                        doc.fontSize(6.5);
                    } else {
                        doc.fillColor('black').text('☐', x, currentY, { width: installmentWidth, align: 'center' });
                    }
                    x += installmentWidth + 2;
                });
            }

            doc.fillColor(totalDue > 0 ? 'red' : 'green').fontSize(6.5);
            doc.text(totalDue > 0 ? `₹${Math.round(totalDue)}` : '₹0', x, currentY, { width: feeDueWidth, align: 'center' });
            doc.moveDown(0.6);
        });

        doc.moveDown(0.5);
        doc.fontSize(7).fillColor('gray').text(
            `Total Students: ${batch.students.length} | Legend: ☐=Unpaid, Date=Paid, Orange=Partial | Generated by MathLogs`,
            { align: 'center' }
        );

        doc.end();
    });
}

// Worker thread entry point
generate(workerData as BatchPdfData)
    .then(buffer => parentPort!.postMessage(buffer))
    .catch(err => { throw err; });
