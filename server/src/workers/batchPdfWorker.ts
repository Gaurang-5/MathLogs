import { parentPort, workerData } from 'worker_threads';
// const PDFDocument = require('pdfkit');

// Inline the header utility to avoid cross-thread import issues
function addMathLogsHeader(doc: PDFKit.PDFDocument, x: number) {
    doc.save();
    try {
        doc.fontSize(14).fillColor('#4F46E5')
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
            createdAt: string | Date;
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

    const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: any) => chunks.push(chunk));

    return new Promise((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        addMathLogsHeader(doc, 30);
        doc.moveDown(1.5);

        doc.fontSize(18).font('Helvetica-Bold')
            .text(`${batch.name} - Students & Fee Details`, { align: 'center' });
        doc.fontSize(11).font('Helvetica')
            .text(`Subject: ${batch.subject || 'N/A'} | Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
        doc.moveDown(1);

        const startX = 30;
        const pageRight = 842 - 30; // A4 Landscape width is ~841.89
        const pageWidth = pageRight - startX;
        
        // Define column widths explicitly
        let nameWidth = 140;
        let schoolWidth = 120;
        const phoneWidth = 90;
        const avgWidth = 50;
        let feeDueWidth = 70;
        
        let fixedColsWidth = nameWidth + schoolWidth + phoneWidth + avgWidth + feeDueWidth + (5 * 5);
        let remainingWidthForInstallments = pageWidth - fixedColsWidth;
        
        // If there are many installments, columns might be too tight. 
        // We will adjust slightly if needed, but A4 landscape allows ~780px.
        const instCount = Math.max(numInstallments, 1);
        let installmentWidth = Math.floor(remainingWidthForInstallments / instCount) - 5;
        
        if (installmentWidth < 50) {
            // Shrink other columns if we have a lot of installments
            nameWidth = 100;
            schoolWidth = 100;
            feeDueWidth = 60;
            fixedColsWidth = nameWidth + schoolWidth + phoneWidth + avgWidth + feeDueWidth + (5 * 5);
            remainingWidthForInstallments = pageWidth - fixedColsWidth;
            installmentWidth = Math.floor(remainingWidthForInstallments / instCount) - 5;
        }

        const columns = [
            { label: 'Student Name', width: nameWidth },
            { label: 'School', width: schoolWidth },
            { label: 'Phone', width: phoneWidth },
            { label: 'Avg %', width: avgWidth }
        ];

        installments.forEach(inst => {
            const instName = inst.name.length > 10 ? inst.name.substring(0, 9) + '.' : inst.name;
            columns.push({ label: instName, width: installmentWidth });
        });
        columns.push({ label: 'Total Due', width: feeDueWidth });

        const rowHeight = 25; // Good spacing for readability
        let currentY = doc.y;

        const drawGridRow = (y: number, isHeader = false, isAlternate = false) => {
            if (isHeader) {
                doc.fillColor('#e5e7eb').rect(startX, y, pageWidth, rowHeight).fill();
                doc.fillColor('black');
            } else if (isAlternate) {
                doc.fillColor('#f9fafb').rect(startX, y, pageWidth, rowHeight).fill();
                doc.fillColor('black');
            }

            // Draw horizontal borders
            doc.moveTo(startX, y).lineTo(pageRight, y).lineWidth(1).strokeColor('#d1d5db').stroke();
            doc.moveTo(startX, y + rowHeight).lineTo(pageRight, y + rowHeight).stroke();

            // Draw vertical borders
            let xEdge = startX;
            doc.moveTo(xEdge, y).lineTo(xEdge, y + rowHeight).stroke();
            columns.forEach(col => {
                xEdge += col.width + 5;
                doc.moveTo(xEdge, y).lineTo(xEdge, y + rowHeight).stroke();
            });
        };

        const drawHeaders = (y: number) => {
            drawGridRow(y, true);
            doc.font('Helvetica-Bold').fontSize(10).fillColor('black');
            let x = startX + 3;
            const textY = y + 7;
            
            columns.forEach(col => {
                doc.text(col.label, x, textY, { width: col.width, align: 'left', lineBreak: false });
                x += col.width + 5;
            });
            return y + rowHeight;
        };

        currentY = drawHeaders(currentY);

        let rowIndex = 0;
        batch.students.forEach(student => {
            if (currentY + rowHeight > 540) { // A4 landscape height is ~595.28
                doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 });
                currentY = 40;
                addMathLogsHeader(doc, 30);
                doc.moveDown(1.5);
                currentY = doc.y; // Update Y after adding header
                currentY = drawHeaders(currentY); // Re-draw headers and update Y
                rowIndex = 0; // Optional: Reset alt rows on new page
            }

            const isAlt = rowIndex % 2 === 1;
            drawGridRow(currentY, false, isAlt);

            const avgMarks = student.marks.length > 0
                ? Math.round(student.marks.reduce((s, m) => s + m.score, 0) / student.marks.length)
                : 0;

            let totalDue = 0;
            if (installments.length > 0) {
                const joinDate = new Date(student.createdAt);
                const applicableInstallments = installments.filter(i => new Date(i.createdAt) >= joinDate);
                const totalExpected = applicableInstallments.reduce((s, i) => s + i.amount, 0);
                const totalPaidFromPayments = student.feePayments.reduce((s, p) => s + p.amountPaid, 0);
                const totalPaidFromFees = student.fees.filter(f => f.status === 'PAID').reduce((s, f) => s + f.amount, 0);
                totalDue = Math.max(0, totalExpected - totalPaidFromPayments - totalPaidFromFees);
            } else {
                const totalExpected = batch.feeAmount || 0;
                const totalPaid = student.fees.filter(f => f.status === 'PAID').reduce((s, f) => s + f.amount, 0)
                    + student.feePayments.reduce((s, p) => s + p.amountPaid, 0);
                totalDue = Math.max(0, totalExpected - totalPaid);
            }

            doc.font('Helvetica').fontSize(9).fillColor('black');
            let x = startX + 3;
            const textY = currentY + 7.5;

            // Student Name
            doc.text(student.name || '-', x, textY, { width: columns[0].width, ellipsis: true }); x += columns[0].width + 5;
            // School
            doc.text(student.schoolName || '-', x, textY, { width: columns[1].width, ellipsis: true }); x += columns[1].width + 5;
            // Phone
            doc.text(student.parentWhatsapp || '-', x, textY, { width: columns[2].width, ellipsis: true }); x += columns[2].width + 5;
            // Avg
            doc.text(avgMarks > 0 ? `${avgMarks}%` : '-', x, textY, { width: columns[3].width, align: 'center', ellipsis: true }); x += columns[3].width + 5;

            // Installments
            let instColIndex = 4;
            if (installments.length > 0) {
                const joinDate = new Date(student.createdAt);
                installments.forEach(inst => {
                    const cWidth = columns[instColIndex].width;
                    if (new Date(inst.createdAt) < joinDate) {
                        doc.fillColor('gray').text('-', x, textY, { width: cWidth, align: 'center' });
                        doc.fillColor('black');
                        x += cWidth + 5;
                        instColIndex++;
                        return;
                    }

                    const paymentsForThis = student.feePayments.filter(p => p.installmentId === inst.id);
                    const totalPaid = paymentsForThis.reduce((s, p) => s + p.amountPaid, 0);
                    const due = inst.amount - totalPaid;

                    if (totalPaid >= inst.amount - 0.01) {
                        const latestPayment = [...paymentsForThis].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                        const payDate = new Date(latestPayment.date);
                        const month = (payDate.getMonth() + 1).toString().padStart(2, '0');
                        const day = payDate.getDate().toString().padStart(2, '0');
                        doc.fillColor('green').font('Helvetica-Bold').text(`Paid: ${day}/${month}`, x, textY, { width: cWidth, align: 'center' });
                    } else if (totalPaid > 0) {
                        doc.fillColor('#d97706').font('Helvetica-Bold').text(`Due ₹${Math.round(due)}`, x, textY, { width: cWidth, align: 'center' });
                    } else {
                        doc.fillColor('red').font('Helvetica-Bold').text(`Unpaid`, x, textY, { width: cWidth, align: 'center' });
                    }
                    doc.font('Helvetica'); // reset
                    x += cWidth + 5;
                    instColIndex++;
                });
            }

            // Total Due
            const feeColWidth = columns[columns.length - 1].width;
            doc.fillColor(totalDue > 0 ? 'red' : 'green').font('Helvetica-Bold');
            doc.text(totalDue > 0 ? `₹${Math.round(totalDue)}` : 'Clear', x, textY, { width: feeColWidth, align: 'center' });
            
            currentY += rowHeight;
            rowIndex++;
        });

        doc.moveDown(1.5);
        doc.fontSize(9).fillColor('gray').text(
            `Total Students: ${batch.students.length} | Generated by MathLogs Automated System`,
            { align: 'center' }
        );

        doc.end();
    });
}

// Worker thread entry point
generate(workerData as BatchPdfData)
    .then(buffer => parentPort!.postMessage(buffer))
    .catch(err => { throw err; });
