import { afterEach, describe, expect, it, vi } from 'vitest';
import { correlation, findTiles, iconSignature, iconMatchMetrics, matchIcons } from './matcher';

afterEach(() => vi.unstubAllGlobals());

/**
 * 图标定位、像素相关性与候选决策。
 *
 * 方块定位用纯像素数据覆盖；候选决策用像素桩，真实模板解码由真窗口烟测覆盖。
 * 相关系数算错不会报错，
 * 只会让「哪一格是哪个技能」整体偏掉，而那在界面上看起来只是「认错了」。
 */

const gray = (...values: number[]) => Float32Array.from(values);

describe('图标候选歧义', () => {
    it('相同图案的不同技能保留候选，同名模板不会制造歧义', async () => {
        const data = new Uint8ClampedArray(40 * 40 * 4);
        for (let i = 0; i < data.length; i += 4) {
            data.set([i % 251, i % 127, i % 79, 255], i);
        }
        const image = { width: 40, height: 40, data } as ImageData;
        vi.stubGlobal(
            'Image',
            class {
                src = '';
                async decode() {}
            },
        );
        vi.stubGlobal('document', {
            createElement: () => ({
                getContext: () => ({ drawImage() {}, getImageData: () => image }),
            }),
        });
        const box = { x: 0, y: 0, width: 40, height: 40 };
        const onAmbiguous = vi.fn();
        expect(
            await matchIcons(
                image,
                [
                    { name: '茁壮', url: '/ambiguous-a.png' },
                    { name: '欣欣向荣', url: '/ambiguous-b.png' },
                ],
                { tiles: [box], onAmbiguous },
            ),
        ).toEqual([]);
        expect(onAmbiguous).toHaveBeenCalledWith(['茁壮', '欣欣向荣'], box);
        const hits = await matchIcons(
            image,
            [
                { name: '同一技能', url: '/ambiguous-a.png' },
                { name: '同一技能', url: '/ambiguous-b.png' },
            ],
            { tiles: [box] },
        );
        expect(hits.map((one) => one.name)).toEqual(['同一技能']);
        expect(iconMatchMetrics()).toMatchObject({ tiles: 1, candidates: 2 });
    });
});

describe('同形异色技能', () => {
    function icon(rgb: number[], badge = false): ImageData {
        const width = 40;
        const data = new Uint8ClampedArray(width * width * 4);
        for (let y = 0; y < width; y++)
            for (let x = 0; x < width; x++) {
                const color = x > 12 && x < 27 && y > 8 && y < 34 ? rgb : [210, 190, 15];
                data.set(
                    [...(badge && x < 10 && y < 10 ? [160, 20, 220] : color), 255],
                    (y * width + x) * 4,
                );
            }
        return { width, height: width, data } as ImageData;
    }
    const box = { x: 0, y: 0, width: 40, height: 40 };
    it('灰度下同形的红蓝图案，彩色比对可以区分', () => {
        const blue = icon([5, 5, 160]);
        const red = icon([160, 5, 5]);
        expect(correlation(iconSignature(blue, box, 32), iconSignature(red, box, 32))).toBeCloseTo(
            1,
        );
        expect(
            correlation(
                iconSignature(blue, box, 32, { color: true }),
                iconSignature(red, box, 32, { color: true }),
            ),
        ).toBeLessThan(0.8);
    });
    it('忽略认证角标后仍与同一技能吻合', () => {
        const appearance = { color: true, inset: 0.08, ignoreTopLeft: 0.26 };
        expect(
            correlation(
                iconSignature(icon([5, 5, 160]), box, 32, appearance),
                iconSignature(icon([5, 5, 160], true), box, 32, appearance),
            ),
        ).toBeCloseTo(1);
    });
});

describe('相关系数', () => {
    it('同一份灰度是 1', () => {
        const a = gray(10, 40, 90, 160);
        expect(correlation(a, a)).toBeCloseTo(1, 6);
    });

    it('反相是 −1（相关看的是形状，不是亮度）', () => {
        const a = gray(0, 50, 120, 200);
        const b = a.map((value) => 255 - value);
        expect(correlation(a, Float32Array.from(b))).toBeCloseTo(-1, 6);
    });

    it('线性变换不影响（缩放与平移都免疫）', () => {
        const a = gray(0, 50, 120, 200);
        const b = a.map((value) => value * 0.5 + 30);
        expect(correlation(a, Float32Array.from(b))).toBeCloseTo(1, 6);
    });

    it('毫无关系的一对接近 0', () => {
        const a = gray(0, 0, 255, 255);
        const b = gray(0, 255, 0, 255);
        expect(Math.abs(correlation(a, b))).toBeLessThan(0.01);
    });

    it('常数块给 0 而不是 NaN（没有方差就没有相关性）', () => {
        expect(correlation(gray(7, 7, 7, 7), gray(1, 2, 3, 4))).toBe(0);
    });
});

describe('方块检测的形状判据', () => {
    /* 尺寸按截图短边筛，与截图分辨率无关——只验两个极端：
     * 太小的一律不理（文字笔画），太大的一律不理（整块面板背景）。 */
    it('全红的一张图找不到「方块」（整屏都是红的，没有边界）', () => {
        const width = 64;
        const height = 64;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 200;
            data[i + 1] = 40;
            data[i + 2] = 30;
            data[i + 3] = 255;
        }
        /* 64 宽的图里，整屏是一个 64×64 的连通块 > 短边 25% 的上限，被尺寸筛掉。 */
        expect(findTiles({ width, height, data } as ImageData)).toEqual([]);
    });

    it('一个方块都没有时返回空（不抛错）', () => {
        const width = 32;
        const height = 32;
        const data = new Uint8ClampedArray(width * height * 4).fill(200);
        expect(findTiles({ width, height, data } as ImageData)).toEqual([]);
    });
});

describe('辅助图标的颜色定位', () => {
    it.each([36, 37])('彩色部分只有 40×%i 时补齐暗色底边，不拉伸图标', (coloredHeight) => {
        const width = 200;
        const height = 200;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let y = 40; y < 40 + coloredHeight; y += 1) {
            for (let x = 60; x < 100; x += 1) {
                data.set([210, 160, 45, 255], (y * width + x) * 4);
            }
        }
        expect(findTiles({ width, height, data } as ImageData)).toEqual([
            { x: 60, y: 40, width: 40, height: 40 },
        ]);
    });

    it.each([
        ['金色', [210, 160, 45]],
        ['蓝色', [45, 160, 210]],
        ['粉红', [220, 80, 75]],
    ] as const)('%s边框图标能定位', (_name, rgb) => {
        const width = 200;
        const height = 200;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let y = 40; y < 80; y += 1) {
            for (let x = 60; x < 100; x += 1) {
                if (x >= 63 && x < 97 && y >= 43 && y < 77) continue;
                const at = (y * width + x) * 4;
                data.set([...rgb, 255], at);
            }
        }
        expect(findTiles({ width, height, data } as ImageData)).toContainEqual({
            x: 60,
            y: 40,
            width: 40,
            height: 40,
        });
    });
});
