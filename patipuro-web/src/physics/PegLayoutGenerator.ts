import Matter from 'matter-js';

/**
 * リアルなパチンコ盤の釘配置を生成（物理演算担当）
 */
export class PegLayoutGenerator {
    private static readonly PEG_RADIUS = 2.6;

    /**
     * 実際のパチンコ風の釘を生成
     */
    static generateRealisticPegs(Bodies: typeof Matter.Bodies): Matter.Body[] {
        const pegs: Matter.Body[] = [];
        type PegPoint = { x: number; y: number };
        type PegRowSpec = {
            y: number;
            xStart: number;
            count: number;
            step?: number;
            skipIndices?: number[];
        };

        // 1) 個別に調整したい点（ここを直接いじるだけでOK）
        const customPegs: PegPoint[] = [];

        // 2) メイン面の段構成（xStart / count / step / skipIndices を編集）
        const rowSpecs: PegRowSpec[] = [
            { y: 170, xStart: 92, count: 8, step: 32 },
            { y: 202, xStart: 76, count: 8, step: 32 },
            { y: 236, xStart: 92, count: 8, step: 32, skipIndices: [3, 4] },
            { y: 268, xStart: 76, count: 8, step: 32 },
            { y: 302, xStart: 92, count: 7, step: 32 },
            { y: 334, xStart: 76, count: 8, step: 32 },
            { y: 368, xStart: 92, count: 7, step: 32 },
            { y: 402, xStart: 76, count: 8, step: 32 },
            { y: 438, xStart: 96, count: 6, step: 34 },
            { y: 472, xStart: 82, count: 7, step: 36 }
        ];

        // 3) サイド道釘（ジグザグ列。値を変えると一気に調整可）
        const leftGuidePegs = this.buildZigzagColumns(34, 52, 166, 32, 16, 10);
        const rightGuidePegs = this.buildZigzagColumns(332, 316, 172, 34, 16, 9);

        const rowPegs = this.expandRowSpecs(rowSpecs);

        [...customPegs, ...rowPegs, ...leftGuidePegs, ...rightGuidePegs].forEach(({ x, y }) => {
            pegs.push(this.createPeg(Bodies, x, y));
        });

        return pegs;
    }
    
    /**
     * 釘を作成
     */
    private static createPeg(Bodies: typeof Matter.Bodies, x: number, y: number): Matter.Body {
        return Bodies.circle(x, y, this.PEG_RADIUS, {
            isStatic: true,
            restitution: 0.8,
            slop: 0.005, // より厳密に
            render: { fillStyle: '#ffcc00' }
        });
    }

    private static expandRowSpecs(
        rowSpecs: Array<{ y: number; xStart: number; count: number; step?: number; skipIndices?: number[] }>
    ): Array<{ x: number; y: number }> {
        const points: Array<{ x: number; y: number }> = [];

        rowSpecs.forEach(({ y, xStart, count, step = 32, skipIndices = [] }) => {
            for (let index = 0; index < count; index++) {
                if (skipIndices.includes(index)) continue;
                points.push({ x: xStart + index * step, y });
            }
        });

        return points;
    }

    private static buildZigzagColumns(
        xA: number,
        xB: number,
        yStart: number,
        rowStep: number,
        offset: number,
        rows: number
    ): Array<{ x: number; y: number }> {
        const points: Array<{ x: number; y: number }> = [];

        for (let row = 0; row < rows; row++) {
            const y = yStart + row * rowStep;
            points.push({ x: xA, y });
            points.push({ x: xB, y: y + offset });
        }

        return points;
    }
}
