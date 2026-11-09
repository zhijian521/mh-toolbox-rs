import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import catalogue from '../../public/game/data/pet-portraits.json';

const directory = new URL('../../public/game/icons/pet-portrait/', import.meta.url);

describe('召唤兽头像原图清单', () => {
    it('稳定编号唯一，文件与清单一一对应，每张图尺寸一致', () => {
        expect(new Set(catalogue.icons.map((one) => one.id)).size).toBe(catalogue.icons.length);
        expect(new Set(readdirSync(directory).filter((file) => file.endsWith('.png')))).toEqual(
            new Set(catalogue.icons.map((one) => one.img)),
        );
        for (const one of catalogue.icons) {
            const png = readFileSync(new URL(one.img, directory));
            expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
            expect(png.readUInt32BE(16)).toBe(one.width);
            expect(png.readUInt32BE(20)).toBe(one.height);
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
