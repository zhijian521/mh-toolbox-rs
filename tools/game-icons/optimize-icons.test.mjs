import { describe, expect, it, vi } from 'vitest';
import { encodeIcon } from './optimize-icons.mjs';

function codec({
    format = 'png',
    metadata = {},
    size = 50,
    pixels,
    info = {},
    paletteSize = 200,
    palettePixels,
} = {}) {
    const input = Buffer.alloc(100, 1);
    const candidate = Buffer.alloc(size, 2);
    const palette = Buffer.alloc(paletteSize, 3);
    const original = Buffer.from([10, 20, 30, 255, 40, 50, 60, 0]);
    const dimensions = { width: 2, height: 1, channels: 4 };
    const encode = vi.fn();
    const raw = vi.fn();
    const sharp = (buffer) => {
        let encoded = candidate;
        const image = {
            metadata: async () => ({ format, depth: 'uchar', ...metadata }),
            clone: () => sharp(buffer),
            png: (options) => {
                encode(options);
                encoded = options.palette ? palette : candidate;
                return image;
            },
            webp: (options) => {
                encode(options);
                return image;
            },
            ensureAlpha: () => image,
            raw: () => {
                raw();
                return image;
            },
            toBuffer: async (options) => {
                if (!options) return encoded;
                return buffer === input
                    ? { data: original, info: dimensions }
                    : {
                          data: (buffer === palette ? palettePixels : pixels) ?? original,
                          info: { ...dimensions, ...info },
                      };
            },
        };
        return image;
    };
    return { sharp, input, candidate, palette, encode, raw };
}

describe('图标同格式无损压缩边界', () => {
    it.each(['png', 'webp'])('更小且 RGBA / 尺寸相同才替换 %s', async (format) => {
        const { sharp, input, candidate, encode } = codec({ format });
        expect(await encodeIcon(sharp, input)).toBe(candidate);
        expect(encode).toHaveBeenCalledWith(
            format === 'png'
                ? { compressionLevel: 9, adaptiveFiltering: true }
                : { lossless: true, effort: 6 },
        );
    });

    it.each([100, 101])('候选 %i 字节不小于原图时原样保留', async (size) => {
        const { sharp, input, raw } = codec({ size });
        expect(await encodeIcon(sharp, input)).toBe(input);
        expect(raw).not.toHaveBeenCalled();
    });

    it('透明像素的隐藏颜色变化也拒绝替换', async () => {
        const { sharp, input } = codec({ pixels: Buffer.from([10, 20, 30, 255, 0, 0, 0, 0]) });
        expect(await encodeIcon(sharp, input)).toBe(input);
    });

    it('调色板编码更小且完全保留颜色时采用', async () => {
        const { sharp, input, palette } = codec({ paletteSize: 30 });
        expect(await encodeIcon(sharp, input)).toBe(palette);
    });

    it('调色板减少颜色时退回普通 PNG，不采用近似颜色', async () => {
        const { sharp, input, candidate } = codec({
            paletteSize: 30,
            palettePixels: Buffer.alloc(8),
        });
        expect(await encodeIcon(sharp, input)).toBe(candidate);
    });

    it('像素字节相同但宽高不同仍拒绝替换', async () => {
        const { sharp, input } = codec({ info: { width: 1, height: 2 } });
        expect(await encodeIcon(sharp, input)).toBe(input);
    });

    it.each([
        { pages: 2 },
        { orientation: 6 },
        { icc: Buffer.from('profile') },
        { depth: 'ushort' },
    ])('动画、旋转、色彩配置或高位深保持原编码：%j', async (metadata) => {
        const { sharp, input, encode } = codec({ metadata });
        expect(await encodeIcon(sharp, input)).toBe(input);
        expect(encode).not.toHaveBeenCalled();
    });

    it('GIF 不进入静态重编码', async () => {
        const { sharp, input, encode } = codec({ format: 'gif' });
        expect(await encodeIcon(sharp, input)).toBe(input);
        expect(encode).not.toHaveBeenCalled();
    });
});
