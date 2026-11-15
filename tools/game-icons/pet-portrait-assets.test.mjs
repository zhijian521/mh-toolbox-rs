import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import catalogue from '../../public/game/data/pet-portraits.json';
import { selectPortraits } from './optimize-pet-portraits.mjs';

const directory = new URL('../../public/game/icons/pet-portrait/', import.meta.url);

describe('召唤兽头像原图清单', () => {
    it('每个物种只有一个普通头像，旧编号唯一且不占用当前编号', () => {
        const ids = new Set(catalogue.icons.map((one) => one.id));
        const aliases = catalogue.icons.flatMap((one) => one.aliases);
        expect(new Set(catalogue.icons.map((one) => one.species)).size).toBe(
            catalogue.icons.length,
        );
        expect(new Set(aliases).size).toBe(aliases.length);
        expect(aliases.every((id) => !ids.has(id))).toBe(true);
        for (const one of catalogue.icons) {
            expect(one.name).toBe(one.species);
            expect(one.name).not.toMatch(/^变异|·进阶|·立绘/);
            expect(one.id).toMatch(/^pet-\d+$/);
        }
    });

    it('清理按物种保留普通头像，重复执行不丢旧编号', () => {
        const icons = [
            { id: 'pet-1', name: '鬼将', species: '鬼将' },
            { id: 'pet-2', name: '变异鬼将', species: '变异鬼将' },
            { id: 'pet-1-1', name: '鬼将·进阶', species: '鬼将' },
            { id: 'portrait-a', name: '鬼将·立绘', species: '鬼将' },
            { id: 'pet-3', name: '超级泡泡', species: '超级泡泡' },
        ];
        const result = selectPortraits(icons);
        expect(result.map((one) => one.id)).toEqual(['pet-1', 'pet-3']);
        expect(new Set(result[0].aliases)).toEqual(new Set(['pet-2', 'pet-1-1', 'portrait-a']));
        expect(selectPortraits(result)).toEqual(result);
        expect(selectPortraits([icons[0], icons[4]], result)).toEqual(result);
        expect(() => selectPortraits([icons[1]])).toThrow('缺少普通头像');
    });
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
