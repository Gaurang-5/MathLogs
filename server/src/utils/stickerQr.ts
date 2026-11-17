import bwipjs from 'bwip-js';

export const QR_QUIET_MODULES = 4;

/** Keep the encoded student ID unchanged; reserve the required white margin explicitly. */
export function studentQrMatrix(humanId: string) {
    const matrix = bwipjs.raw('qrcode', humanId, 'eclevel=M')[0];
    if (!matrix || !('pixs' in matrix) || matrix.pixx !== matrix.pixy) throw new Error('Could not encode student QR');
    return matrix;
}

/** Vector modules stay sharp in the PDF instead of resampling a small PNG at print time. */
export function drawStudentQr(doc: PDFKit.PDFDocument, humanId: string, x: number, y: number, size: number) {
    const matrix = studentQrMatrix(humanId);
    const moduleSize = size / (matrix.pixx + QR_QUIET_MODULES * 2);
    doc.save().rect(x, y, size, size).fill('#FFFFFF');
    for (let row = 0; row < matrix.pixy; row++) {
        // Combine adjacent black modules so shared edges cannot show antialiasing seams.
        for (let col = 0; col < matrix.pixx;) {
            if (!matrix.pixs[row * matrix.pixx + col]) { col++; continue; }
            const start = col;
            while (col < matrix.pixx && matrix.pixs[row * matrix.pixx + col]) col++;
            doc.rect(x + (start + QR_QUIET_MODULES) * moduleSize, y + (row + QR_QUIET_MODULES) * moduleSize,
                (col - start) * moduleSize, moduleSize);
        }
    }
    doc.fill('#000000').restore();
}
