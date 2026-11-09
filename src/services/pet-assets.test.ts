import { describe, expect, it } from 'vitest';
import skills from '../../public/game/data/pet-skills.json';
import portraits from '../../public/game/data/pet-portraits.json';
import panel from '../../public/game/data/pet-panel.json';
import { parsePetIcons, parsePetPanel } from './pet-assets';

describe('召唤兽资源契约', () => {
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
