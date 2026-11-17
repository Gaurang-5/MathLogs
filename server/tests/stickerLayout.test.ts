import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import PDFDocument from 'pdfkit';
import { prisma } from '../src/prisma';
import { generateStickerSheet } from '../src/controllers/stickerController';

test('sticker sheet keeps exact label placement, fits full names, and has one blank marks box', async () => {
    const names = ['Aarav Sharma', 'Ananya Lakshmi Narayanan Krishnamurthy', 'Aditya Venkata Sai Subramanian', 'A'.repeat(200)];
    const students = Array.from({ length: 66 }, (_, index) => ({ name: names[index % names.length], humanId: `DEMO${index}` }));
    const originalFind = prisma.student.findMany;
    const originalText = PDFDocument.prototype.text;
    const originalRect = PDFDocument.prototype.roundedRect;
    const texts: Array<{ text: string; height: number; options: any }> = [];
    const rectangles: number[][] = [];
    (prisma.student.findMany as any) = async () => students;
    PDFDocument.prototype.text = function (text: string, x: number, y: number, options: any) {
        texts.push({ text, height: this.heightOfString(text, options), options });
        return originalText.call(this, text, x, y, options);
    } as any;
    PDFDocument.prototype.roundedRect = function (x: number, y: number, w: number, h: number, r?: number) {
        rectangles.push([x, y, w, h]);
        return originalRect.call(this, x, y, w, h, r);
    };
    try {
        const res: any = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
        res.setHeader = () => {};
        res.status = () => res;
        res.send = (message: string) => { throw new Error(message); };
        const finished = new Promise<void>((resolve, reject) => { res.on('finish', resolve); res.on('error', reject); });
        await generateStickerSheet({ query: {}, user: { id: 'demo', instituteId: 'demo', role: 'TEACHER' } } as any, res);
        await finished;
        assert.deepEqual(texts.map(item => item.text), students.map(student => student.name));
        for (const item of texts) {
            assert.ok(item.height <= 11, `Name must fit header: ${item.text}`);
            assert.equal(item.options.ellipsis, undefined);
            assert.equal(item.options.height, undefined, 'no clipping of text');
        }
        assert.equal(rectangles.length, 66 * 2, 'one outer sticker and one marks box per student');
        const mm = 2.83465;
        for (let i = 0; i < students.length; i++) {
            const position = i % 65;
            const [x, y, width, height] = rectangles[i * 2];
            assert.equal(x, 3 * mm + (position % 5) * (39 * mm + 2 * mm));
            assert.equal(y, 13 * mm + Math.floor(position / 5) * 21 * mm);
            assert.equal(width, 39 * mm);
            assert.equal(height, 21 * mm);
            const [bx, by, bw, bh] = rectangles[i * 2 + 1];
            assert.ok(bx > x && by >= y + 19 && bx + bw < x + width && by + bh < y + height);
        }
    } finally {
        prisma.student.findMany = originalFind;
        PDFDocument.prototype.text = originalText;
        PDFDocument.prototype.roundedRect = originalRect;
    }
});
