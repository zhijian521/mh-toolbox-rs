// 原图校验需要 Node 文件与摘要 API，留在工具目录，避免给渲染层引入 Node 类型。
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import catalogue from '../../public/game/data/pet-skills.json';

const ICON_ROOT = new URL('../../public/game/icons/', import.meta.url);

describe('召唤兽技能素材清单', () => {
    it('四类名称与稳定 ID 完整，常规与升星扩展分开记录', () => {
        expect(catalogue.icons).toHaveLength(353);
        expect(new Set(catalogue.icons.map((skill) => skill.id)).size).toBe(353);
        expect(
            Object.fromEntries(
                catalogue.categories.map(({ id }) => [
                    id,
                    catalogue.icons.filter((skill) => skill.categoryId === id).length,
                ]),
            ),
        ).toEqual({ basic: 68, advanced: 52, super: 48, special: 185 });
        expect(catalogue.icons.filter((skill) => skill.scope === 'core')).toHaveLength(264);
        expect(catalogue.icons.filter((skill) => skill.scope === 'god-evolution')).toHaveLength(89);
        for (const skill of catalogue.icons) {
            expect(skill.id).toMatch(/^\d+$/);
            expect(skill.name.trim()).toBe(skill.name);
            expect(skill.name).not.toBe('');
            expect(skill.displayName.trim()).not.toBe('');
            expect(catalogue.categories.some(({ id }) => id === skill.categoryId)).toBe(true);
        }
    });

    it('每类文件与清单一一对应，PNG 原尺寸与发布文件摘要一致', () => {
        for (const category of catalogue.categories) {
            const skills = catalogue.icons.filter((skill) => skill.categoryId === category.id);
            const directory = new URL(`${category.iconDir}/`, ICON_ROOT);
            const files = readdirSync(directory).filter((file) => file.endsWith('.png'));
            expect(new Set(files)).toEqual(new Set(skills.map((skill) => skill.img)));
            for (const skill of skills) {
                expect(skill.img).toBe(`${category.iconDir}-${skill.id}.png`);
                const png = readFileSync(new URL(skill.img, directory));
                expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
                expect(png.readUInt32BE(16)).toBe(skill.width);
                expect(png.readUInt32BE(20)).toBe(skill.height);
                expect(createHash('sha256').update(png).digest('hex')).toBe(skill.sha256);
            }
        }
    });

    it('反击和冥思低级蓝色、高级红色，纠错图片不能再次对调', () => {
        // 纠错图的摘要独立固定，防止图片与清单同时回退到错误映射。
        const corrected = [
            [
                '302',
                '反击',
                'basic',
                '3131b8e2dbc05e88315ba514faf176ae658ce92d4072974cae6237b0beceb6a5',
                '31653d31dcffb466a770f1f8e9d38608dad31e174032f849962522d19931673c',
            ],
            [
                '310',
                '冥思',
                'basic',
                '3676feebf25c5dc6520c4c6fd35fbef314ccf5e4461802b969231cb3962197f2',
                '5aaa502bd1a885984258d77238b68a72d136ef3a283958fc109e88ae9b0e66a1',
            ],
            [
                '402',
                '高级反击',
                'advanced',
                '5232eb2946757037d0c94ea6c2829bfcc5b66aaef06890007a57b0824c2144e3',
                'a160b0aa4f6f377f0713a5148b5fd141ba905256195400120663207ea728b981',
            ],
            [
                '410',
                '高级冥思',
                'advanced',
                '531ec899f07286140054f046ad801880e2c0577302bde37bdc05eda0b81948bd',
                '44898ff5f1e7755b1204f2d45609b66f3ed2d13980b0cb48ce34bad1d1dcbae4',
            ],
        ];
        for (const [id, name, categoryId, sourceSha256, encodedSha256] of corrected) {
            const skill = catalogue.icons.find((skill) => skill.id === id);
            expect(skill).toMatchObject({
                name,
                categoryId,
                sourceSha256,
            });
            // 原始导入与已比对像素的压缩版都允许，其他摘要必须重新复核。
            expect([sourceSha256, encodedSha256]).toContain(skill.sha256);
        }
    });

    it('缺图项保留名称与 null，神兽专属技能保持特殊分类', () => {
        expect(catalogue.missing.map(({ id, displayName, img }) => [id, displayName, img])).toEqual(
            [
                ['56150', '触类旁通', null],
                ['56196', '触类旁通（强化）', null],
            ],
        );
        for (const skill of catalogue.missing) {
            expect(catalogue.icons.some(({ id }) => id === skill.id)).toBe(false);
            expect(skill.scope).toBe('god-evolution');
        }
        for (const name of ['超级神柚复生', '超级三昧真火']) {
            expect(catalogue.icons.find((skill) => skill.name === name)).toMatchObject({
                categoryId: 'special',
                subgroup: '神兽专属',
            });
        }
    });
});
