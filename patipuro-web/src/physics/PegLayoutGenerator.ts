import Matter from 'matter-js';

export class PegLayoutGenerator {
    private static readonly MICRO_PEG_RADIUS = 1.5;
    private static readonly PEG_RADIUS = 2.6; // 右下の釘用

    // センター液晶（図に合わせて配置）
    private static readonly CENTER_MONITOR = {
        centerX: 200,
        centerY: 240,
        width: 220,
        height: 180
    } as const;

    static getCenterMonitorArea() { return this.CENTER_MONITOR; }

    static generateRealisticPegs(Bodies: typeof Matter.Bodies): Matter.Body[] {
        const bodies: Matter.Body[] = [];
        type Point = { x: number; y: number };

        // =========================================================
        // 1. 左上の玉の出口（図面の矢印部分）
        // =========================================================
        // ※右打ちルートの通路を塞ぐため削除

        // =========================================================
        // 2. 左側の縦ルート（液晶の左に沿って落ちる道）
        // =========================================================
        // 外側の縦壁
        bodies.push(this.createWall(Bodies, 45, 250, 180, 8, Math.PI / 2));
        // 内側の縦壁（液晶の左端に沿う）
        bodies.push(this.createWall(Bodies, 85, 260, 200, 8, Math.PI / 2));
        // 左上から縦ルートへの誘導壁（右打ち上昇路を塞ぐため削除）
         bodies.push(this.createWall(Bodies, 65, 150, 60, 8, Math.PI / 4));

        // =========================================================
        // 3. 左下：風車と、ヘソへ向かう斜めレール
        // =========================================================
        // 風車（図の左下にあるお花/歯車マークを八角形で表現）
        bodies.push(Bodies.polygon(40, 370, 8, 14, {
            isStatic: true, // ←現在は「固定」されています
            restitution: 0.2,
            friction: 0.01,
            frictionStatic: 0.0,
            render: { fillStyle: '#ffcc00' } // 黄色い風車
        }));

        // 液晶の下を通ってヘソに向かう左側のレール
        bodies.push(this.createGuidanceRail(Bodies, 120, 420, 140, 8, 0.35));

        // =========================================================
        // 4. 右側の縦ルートと、ヘソへ向かう斜めレール
        // =========================================================
        // 液晶の右側に沿う縦壁
        bodies.push(this.createWall(Bodies, 315, 260, 200, 8, Math.PI / 2));
        // 液晶の下を通ってヘソに向かう右側のレール
        bodies.push(this.createGuidanceRail(Bodies, 280, 420, 140, 8, -0.35));

        // =========================================================
        // 5. ヘソ（スタートチャッカー：図の「U」字部分）
        // =========================================================
        const hesoY = 480;
        const hesoCenterX = 200;
        const hesoWidth = 28;
        bodies.push(this.createWall(Bodies, hesoCenterX - hesoWidth / 2, hesoY, 8, 30, 0)); // 左壁
        bodies.push(this.createWall(Bodies, hesoCenterX + hesoWidth / 2, hesoY, 8, 30, 0)); // 右壁

        // =========================================================
        // 6. 右下の釘（図面の「oooo」の部分）
        // =========================================================
        const kugiStartX = 250;
        const kugiStartY = 490;
        for (let i = 0; i < 4; i++) {
            bodies.push(Bodies.circle(kugiStartX + i * 12, kugiStartY - i * 10, this.PEG_RADIUS, {
                isStatic: true,
                restitution: 0.6,
                render: { fillStyle: '#d4af37' } // ゴールド色
            }));
        }

        // =========================================================
        // 7. 外枠（ドームと打ち出しレール）
        // =========================================================
        // 大外の左壁（縦棒）
        bodies.push(this.createWallSegment(Bodies, 5, 600, 5, 120));
        // 打ち出し用の内壁（縦棒）
        bodies.push(this.createWallSegment(Bodies, 25, 600, 25, 200));
        // 天井ドーム（棒セグメントの連結）
        const domePoints: Point[] = [];
        for (let a = Math.PI; a >= 0; a -= 0.08) {
            domePoints.push({ x: 200 + 195 * Math.cos(a), y: 190 - 180 * Math.sin(a) });
        }
        domePoints.push({ x: 395, y: 190 }); // 右端を右壁に接続
        for (let i = 0; i < domePoints.length - 1; i++) {
            bodies.push(this.createWallSegment(Bodies,
                domePoints[i].x, domePoints[i].y,
                domePoints[i + 1].x, domePoints[i + 1].y
            ));
        }
        // 大外の右壁（縦棒）
        bodies.push(this.createWallSegment(Bodies, 395, 190, 395, 600));

        // =========================================================
        // 8. 右打ちルート（隙間→右上→右チャンネル→メインフィールド）
        // =========================================================
        // ① 上部内側カーブ壁（右打ちルートの天井ガイド）
        // π*0.70 始まりにして左上の入口を広く取る
        const innerCurvePoints: Point[] = [];
        for (let a = Math.PI * 0.88; a >= Math.PI * 0.05; a -= 0.08) {
            innerCurvePoints.push({ x: 200 + 160 * Math.cos(a), y: 190 - 145 * Math.sin(a) });
        }
        innerCurvePoints.push({
            x: 200 + 160 * Math.cos(Math.PI * 0.05),
            y: 190 - 145 * Math.sin(Math.PI * 0.05)
        });
        for (let i = 0; i < innerCurvePoints.length - 1; i++) {
            bodies.push(this.createWallSegment(Bodies,
                innerCurvePoints[i].x, innerCurvePoints[i].y,
                innerCurvePoints[i + 1].x, innerCurvePoints[i + 1].y
            ));
        }
        // ② 右側チャンネル内壁（縦棒）
        bodies.push(this.createWallSegment(Bodies, 365, 190, 365, 440));
        // ③ 右打ちルート排出斜め壁（チャンネル下端からメインフィールドへ合流）
        bodies.push(this.createWall(Bodies, 380, 470, 70, 8, -0.75));

        bodies.push(this.createWall(Bodies, 340, 470, 70, 8, -0.75));

        bodies.push(this.createWall(Bodies, 320, 520, 8, 30, 0)); // 左壁
        bodies.push(this.createWall(Bodies, 348, 520, 8, 30, 0)); // 右壁

        // 液晶センサー
        bodies.push(this.createCenterMonitorSensor(Bodies));

        return bodies;
    }

    // --- ビルダーメソッド群 ---

    private static createGuidanceRail(
        Bodies: typeof Matter.Bodies,
        x: number, y: number, w: number, h: number, angle: number
    ): Matter.Body {
        return Bodies.rectangle(x, y, w, h, {
            isStatic: true,
            label: 'guidance-rail',
            angle: angle,
            restitution: 0.02,
            friction: 0.05,
            frictionStatic: 0.01,
            slop: 0.005,
            chamfer: { radius: Math.min(w, h) / 2 },
            render: { fillStyle: '#888888' }
        });
    }

    private static createWall(
        Bodies: typeof Matter.Bodies,
        x: number, y: number, w: number, h: number, angle: number
    ): Matter.Body {
        return Bodies.rectangle(x, y, w, h, {
            isStatic: true,
            label: 'rail-wall',
            angle: angle,
            restitution: 0.05,
            friction: 0.0,
            frictionStatic: 0.0,
            slop: 0.02,
            chamfer: { radius: Math.min(w, h) / 2 }, 
            render: { fillStyle: '#888888' }
        });
    }

    private static createWallSegment(
        Bodies: typeof Matter.Bodies,
        x1: number, y1: number,
        x2: number, y2: number
    ): Matter.Body {
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const thickness = 6;
        return Bodies.rectangle(cx, cy, len, thickness, {
            isStatic: true,
            label: 'outer-wall',
            angle,
            restitution: 0.08,
            friction: 0.01,
            frictionStatic: 0.0,
            slop: 0.02,
            chamfer: { radius: thickness / 2 },
            render: { fillStyle: '#c0c0c0' }
        });
    }

    private static createMicroWallPeg(Bodies: typeof Matter.Bodies, x: number, y: number): Matter.Body {
        return Bodies.circle(x, y, this.MICRO_PEG_RADIUS * 1.2, {
            isStatic: true,
            label: 'outer-wall',
            restitution: 0.08,
            friction: 0.01,
            frictionStatic: 0.0,
            slop: 0.02,
            render: { fillStyle: '#e0e0e0' }
        });
    }

    static createCenterMonitorSensor(Bodies: typeof Matter.Bodies): Matter.Body {
        return Bodies.rectangle(this.CENTER_MONITOR.centerX, this.CENTER_MONITOR.centerY, this.CENTER_MONITOR.width, this.CENTER_MONITOR.height, {
            isStatic: true,
            isSensor: true,
            label: 'center-monitor-zone',
            render: { visible: false } 
        });
    }
}