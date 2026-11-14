import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import catalogue from '../../public/game/data/pet-portraits.json';

const directory = new URL('../../public/game/icons/pet-portrait/', import.meta.url);

describe('召唤兽头像原图清单', () => {
    it('稳定编号唯一，文件与清单一一对应，每张图尺寸一致', () => {
        expect(new Set(catalogue.icons.map((one) => one.id)).size).toBe(catalogue.icons.length);
        expect(
            new Set(readdirSync(directory).filter((file) => /\.(png|webp)$/.test(file))),
        ).toEqual(new Set(catalogue.icons.map((one) => one.img)));
        for (const one of catalogue.icons) {
            const image = readFileSync(new URL(one.img, directory));
            if (one.img.endsWith('.webp')) {
                expect(image.subarray(0, 4).toString()).toBe('RIFF');
                expect(image.subarray(8, 12).toString()).toBe('WEBP');
                expect(image.subarray(12, 16).toString()).toBe('VP8L');
                expect(image[20]).toBe(0x2f);
                const bits = image.readUInt32LE(21);
                expect((bits & 0x3fff) + 1).toBe(one.width);
                expect(((bits >>> 14) & 0x3fff) + 1).toBe(one.height);
            } else {
                expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
                expect(image.readUInt32BE(16)).toBe(one.width);
                expect(image.readUInt32BE(20)).toBe(one.height);
            }
            expect(one.species.trim()).not.toBe('');
            expect(one.resourceMd5 || one.source).toBeTruthy();
        }
    });
    it('未取到的资源有明确缺项，已具备头像的物种不会重复报缺', () => {
        const species = new Set(catalogue.icons.map((one) => one.species));
        expect(catalogue.missing.every((one) => !species.has(one.name))).toBe(true);
        expect(catalogue.icons.some((one) => one.species === '鬼将')).toBe(true);
    });
});
