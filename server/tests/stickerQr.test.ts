import test from 'node:test';
import assert from 'node:assert/strict';
import { drawStudentQr, studentQrMatrix, QR_QUIET_MODULES } from '../src/utils/stickerQr';

test('printed QR reserves four blank modules on every side for short and long student IDs', () => {
    for (const id of ['IS-MTH26-001', 'IS-MTH26-12345', 'student-with-a-long-custom-identifier-123456']) {
        const rects: number[][] = [];
        const fills: string[] = [];
        const doc: any = {
            save() { return this; }, restore() { return this; },
            rect(...rect: number[]) { rects.push(rect); return this; },
            fill(color: string) { fills.push(color); return this; },
        };
        const matrix = studentQrMatrix(id);
        const x = 2, y = 14.52765, size = 43;
        drawStudentQr(doc, id, x, y, size);
        assert.deepEqual(rects[0], [x, y, size, size], 'opaque white quiet zone');
        assert.deepEqual(fills, ['#FFFFFF', '#000000']);
        const moduleSize = size / (matrix.pixx + 8);
        const margin = QR_QUIET_MODULES * moduleSize;
        assert.equal(QR_QUIET_MODULES, 4);
        for (const [rx, ry, rw, rh] of rects.slice(1)) {
            assert.ok(rx >= x + margin - 1e-8 && ry >= y + margin - 1e-8);
            assert.ok(rx + rw <= x + size - margin + 1e-8 && ry + rh <= y + size - margin + 1e-8);
        }
        const printedArea = rects.slice(1).reduce((sum, [, , w, h]) => sum + w * h, 0);
        const expectedArea = matrix.pixs.filter(Boolean).length * moduleSize ** 2;
        assert.ok(Math.abs(printedArea - expectedArea) < 1e-7, 'all encoded modules printed once');
    }
});
