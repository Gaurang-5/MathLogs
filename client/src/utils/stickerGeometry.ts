export type Point = { x: number; y: number };
// QR corners map to the known square printed by stickerController (34pt).
// Solve the projective mapping once, then sample the score area in that plane.
export function squareToQuad(points: Point[]): number[] | null {
    if (points.length !== 4 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
    const square = [[0,0],[1,0],[1,1],[0,1]];
    const matrix: number[][] = [];
    square.forEach(([x,y], i) => {
        const p = points[i];
        matrix.push([x,y,1,0,0,0,-p.x*x,-p.x*y,p.x]);
        matrix.push([0,0,0,x,y,1,-p.y*x,-p.y*y,p.y]);
    });
    for (let col=0; col<8; col++) {
        let pivot=col;
        for (let row=col+1;row<8;row++) if (Math.abs(matrix[row][col])>Math.abs(matrix[pivot][col])) pivot=row;
        if (Math.abs(matrix[pivot][col])<1e-8) return null;
        [matrix[col],matrix[pivot]]=[matrix[pivot],matrix[col]];
        const scale=matrix[col][col];
        for(let k=col;k<9;k++) matrix[col][k]/=scale;
        for(let row=0;row<8;row++) if(row!==col) {
            const ratio=matrix[row][col];
            for(let k=col;k<9;k++) matrix[row][k]-=ratio*matrix[col][k];
        }
    }
    return matrix.map(row=>row[8]);
}
export function project(h: number[], x: number, y: number): Point {
    const d=h[6]*x+h[7]*y+1;
    return { x:(h[0]*x+h[1]*y+h[2])/d, y:(h[3]*x+h[4]*y+h[5])/d };
}
