import { describe, expect, it } from 'vitest';
import gear from '../../../public/game/data/gear-icons.json';
import weapons from '../../../public/game/data/weapon-icons.json';
import spirits from '../../../public/game/data/lingshi-icons.json';
import type { EquipmentEntry } from '../../services/game-data';
import type { GearSlotName } from './gear';
import { gearIconFile } from './gear-icons';

const entries: EquipmentEntry[] = [
    ...Object.entries(gear.groups).flatMap(([group, rows]) =>
        rows.map((row) => ({ ...row, group, family: 'gear' as const })),
    ),
    ...Object.entries(weapons.groups).flatMap(([group, rows]) =>
        rows.map((row) => ({ ...row, group, family: 'weapon' as const })),
    ),
    ...Object.entries(spirits.groups).flatMap(([group, rows]) =>
        rows.map((row) => ({ ...row, group, family: 'lingshi' as const })),
    ),
];
const slots: Record<string, GearSlotName> = {
    toukui: '头',
    fachai: '头',
    kaijia: '衣服',
    nvyi: '衣服',
    xianglian: '项链',
    yaodai: '腰带',
    xiezi: '鞋子',
    jiezhi: '戒指',
    ershi: '耳饰',
    peishi: '配饰',
    shouzhuo: '手镯',
};

describe('装备名称与图标', () => {
    it.each(entries)('$name 按真实名录匹配，武器同名时由类别区分', (entry) => {
        const slot = entry.family === 'weapon' ? '武器' : slots[entry.group];
        expect(
            gearIconFile(
                { slot, detail: { name: entry.name, kind: entry.group, stats: [] } },
                entries,
            ),
        ).toBe(`${entry.family}/${entry.img}`);
    });
    it('只填短名也匹配；全半角括号归一，部位不串图', () => {
        expect(gearIconFile({ slot: '头', caption: '黑魔冠' }, entries)).toBe(
            'gear/gear-toukui-03.webp',
        );
        expect(gearIconFile({ slot: '武器', caption: '非天(坤)' }, entries)).toBe(
            'weapon/weapon-shuangjufu-kun-160.webp',
        );
        expect(gearIconFile({ slot: '项链', caption: '水晶帽' }, entries)).toBe(
            'gear/gear-xianglian-01.webp',
        );
    });
    it('未收录的低等级装备回退到本类别 60 级图，女性装备与武器种类分别处理', () => {
        expect(
            gearIconFile(
                {
                    slot: '头',
                    detail: { name: '青铜盔', kind: '头盔', stats: [], requires: ['等级 10'] },
                },
                entries,
            ),
        ).toBe('gear/gear-toukui-01.webp');
        expect(
            gearIconFile(
                { slot: '头', detail: { name: '发簪', kind: '发钗', stats: [] } },
                entries,
            ),
        ).toBe('gear/gear-fachai-01.webp');
        expect(
            gearIconFile(
                {
                    slot: '衣服',
                    detail: { name: '裙子', kind: '衣服', requires: ['女'], stats: [] },
                },
                entries,
            ),
        ).toBe('gear/gear-nvyi-01.webp');
        expect(
            gearIconFile(
                { slot: '武器', detail: { name: '双短剑', kind: '双短剑', stats: [] } },
                entries,
            ),
        ).toBe('weapon/weapon-duanjian-060.webp');
        expect(gearIconFile({ slot: '武器' }, [])).toBe('weapon/weapon-jian-060.webp');
    });
    it('玉魄始终按阴阳取图', () => {
        expect(gearIconFile({ slot: '玉魄·阴' }, entries)).toBe('yupo/yupo-yin.webp');
        expect(gearIconFile({ slot: '玉魄·阳' }, entries)).toBe('yupo/yupo-yang.webp');
    });
});
