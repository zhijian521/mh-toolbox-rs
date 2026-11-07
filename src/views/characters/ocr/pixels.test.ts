import { describe, expect, it } from 'vitest';
import { base64Of, fitSize, swapToBgra } from './pixels';

/**
 * 送到 OCR 之前的像素处理。
 *
 * 这两步错了**不会报任何错**：图看着还是那张图，只是识别率莫名变差。
 * 所以拿几个已知像素钉死通道顺序，拿几组尺寸钉死「不放大、只缩小」。
 */
describe('通道顺序', () => {
    it('RGBA 换成 BGRA，alpha 不动', () => {
        // 一个红点（R=255, G=0, B=0, A=255）：换完 R 与 B 互换。
        const out = swapToBgra(new Uint8ClampedArray([255, 0, 0, 255]));
        expect([...out]).toEqual([0, 0, 255, 255]);
    });

    it('四个像素逐个换，不会错位', () => {
        const out = swapToBgra(
            new Uint8ClampedArray([
                1,
                2,
                3,
                255, // → 3 2 1
                4,
                5,
                6,
                255, // → 6 5 4
            ]),
        );
        expect([...out]).toEqual([3, 2, 1, 255, 6, 5, 4, 255]);
    });
});

describe('尺寸', () => {
    it('长边不超过上限时一格都不缩', () => {
        expect(fitSize(400, 561)).toEqual({ width: 400, height: 561 });
        expect(fitSize(2000, 1200)).toEqual({ width: 2000, height: 1200 });
    });

    it('超了就等比缩到上限，短的按比例', () => {
        expect(fitSize(4000, 2000)).toEqual({ width: 2000, height: 1000 });
        // 竖图也一样按长边算。
        expect(fitSize(1000, 4000)).toEqual({ width: 500, height: 2000 });
    });
});

describe('base64', () => {
    it('已知字节串编码正确', () => {
        expect(base64Of(new Uint8Array([104, 105]))).toBe('aGk=');
    });

    it('分块拼接不会漏字节', () => {
        /* 长度超过单块上限（0x8000），验的是「拼起来还是同一串」——这是这一层唯一
         * 会静默出错的地方：少几个字节，Rust 侧会报「位图长度不符」，而那句话
         * 听起来像尺寸算错了。 */
        const bytes = new Uint8Array(0x18000).map((_, index) => index % 256);
        const back = atob(base64Of(bytes));
        expect(back.length).toBe(bytes.length);
        expect(back.charCodeAt(0)).toBe(0);
        expect(back.charCodeAt(bytes.length - 1)).toBe(bytes[bytes.length - 1]);
    });

    it('空数组给空串', () => {
        expect(base64Of(new Uint8Array())).toBe('');
    });
});
