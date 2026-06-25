import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

/**
 * Adds MathLogs branding to the top-left of a PDF page
 * @param doc - PDFKit document instance
 * @param y - Y position to start (default: 20)
 */
export const addMathLogsHeader = (doc: typeof PDFDocument, y: number = 20) => {
    const logoPath = path.join(__dirname, '../assets/mathlogs-logo.png');

    // Check if logo exists
    if (fs.existsSync(logoPath)) {
        // Add logo image
        doc.image(logoPath, 20, y, { width: 120 });
    } else {
        // Fallback: Just text if logo not found
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e293b').text('MathLogs', 20, y + 5);
    }
};
