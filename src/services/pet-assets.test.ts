import { describe, expect, it } from 'vitest';
import skills from '../../public/game/data/pet-skills.json';
import portraits from '../../public/game/data/pet-portraits.json';
import panel from '../../public/game/data/pet-panel.json';
import { findPetPortrait, parsePetIcons, parsePetPanel } from './pet-assets';

describe('召唤兽资源契约', () => {
    it('鬼将只提供普通头像，旧变异和立绘编号仍指向同一张图片', () => {
        const icons = parsePetIcons(portraits, true);
        const ghost = icons.filter((one) => one.name.includes('鬼将'));
        expect(ghost.map((one) => one.name)).toEqual(['鬼将']);
        for (const id of [
            'pet-2076',
            'pet-2576',
            'portrait-2a54bae2610da714',
            'portrait-87b42cd2cc7c6c23',
        ]) {
            expect(findPetPortrait(icons, id)).toBe(ghost[0]);
        }
        expect(findPetPortrait(icons, 'unknown')).toBeUndefined();
    });

    it('拒绝重复、越界或与现有头像编号冲突的别名', () => {
        const icon = { id: 'pet-1', name: '兽', img: 'pet-1.png' };
        for (const aliases of [['../x'], ['old', 'old'], ['pet-1'], 'old']) {
            expect(() => parsePetIcons({ icons: [{ ...icon, aliases }] }, true)).toThrow();
        }
        expect(() =>
            parsePetIcons(
                {
                    icons: [
                        { ...icon, aliases: ['old'] },
                        { ...icon, id: 'pet-2', aliases: ['old'] },
                    ],
                },
                true,
            ),
        ).toThrow();
    });
    it('头像按清单文件名支持无损 WebP，继续拒绝路径穿越和其他格式', () => {
        const icon = { id: 'pet-1', name: '兽', img: 'pet-1.webp' };
        expect(parsePetIcons({ icons: [icon] }, true)[0].url).toBe(
            '/game/icons/pet-portrait/pet-1.webp',
        );
        for (const img of ['../pet-1.webp', 'pet-1.svg', 'pet-1.webp?x=1']) {
            expect(() => parsePetIcons({ icons: [{ ...icon, img }] }, true)).toThrow();
        }
        expect(() => parsePetIcons({ icons: [{ ...icon, categoryId: 'basic' }] }, false)).toThrow();
    });

    it('已归档技能与头像能生成本地资源地址，规则表保持属性和加点分离', () => {
        expect(parsePetIcons(skills, false).find((one) => one.name === '高级必杀')?.url).toContain(
            '/game/icons/pet-advanced/',
        );
        expect(parsePetIcons(portraits, true).find((one) => one.id === 'pet-2076')?.url).toContain(
            '/game/icons/pet-portrait/',
        );
        expect(parsePetPanel(panel).points).toContain('潜能');
        expect(parsePetPanel(panel).attributes).not.toContain('力量');
        expect(parsePetPanel(panel).qualityTail).toEqual(['life', 'growth', 'element']);
    });
    it('拒绝路径穿越、重复资源编号及残缺标签表', () => {
        expect(() =>
            parsePetIcons({ icons: [{ id: 'a', name: '兽', img: '../x.png' }] }, true),
        ).toThrow();
        expect(() =>
            parsePetIcons({ icons: [portraits.icons[0], portraits.icons[0]] }, true),
        ).toThrow();
        expect(() => parsePetPanel({ ...panel, labels: {} })).toThrow();
        expect(() => parsePetPanel({ ...panel, qualityTail: ['unknown'] })).toThrow();
        expect(() => parsePetPanel({ ...panel, elements: null })).toThrow();
    });
});
