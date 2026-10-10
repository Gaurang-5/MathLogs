import { describe,it,expect } from 'vitest';
import { squareToQuad,project } from './stickerGeometry';
describe('sticker perspective geometry',()=>{
    it('maps QR corners and score coordinates on a rotated paper',()=>{
        const points=[{x:100,y:100},{x:200,y:120},{x:180,y:220},{x:80,y:200}];
        const h=squareToQuad(points)!;
        [[0,0],[1,0],[1,1],[0,1]].forEach(([x,y],i)=>{
            expect(project(h,x,y).x).toBeCloseTo(points[i].x);expect(project(h,x,y).y).toBeCloseTo(points[i].y);
        });
        expect(project(h,2,.5).x).toBeCloseTo(290);
        expect(project(h,2,.5).y).toBeCloseTo(190);
    });
    it('rejects degenerate QR coordinates instead of generating a bogus crop',()=>{
        expect(squareToQuad(Array(4).fill({x:0,y:0}))).toBeNull();
        expect(squareToQuad([{x:NaN,y:1}])).toBeNull();
    });
});
