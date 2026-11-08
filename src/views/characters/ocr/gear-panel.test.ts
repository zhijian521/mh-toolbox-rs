import { describe, expect, it } from 'vitest';
import gearNames from '../../../../public/game/data/gear-icons.json';
import weaponNames from '../../../../public/game/data/weapon-icons.json';
import spiritNames from '../../../../public/game/data/lingshi-icons.json';
import type { EquipmentName } from '../../../services/game-data';
import type { GearSlot, GearSlotName } from '../gear';
import type { OcrLine } from './attr-panel';
import { mergeGearPanel, parseGearPanel } from './gear-panel';

const names: EquipmentName[] = [
    ...Object.entries(gearNames.groups).flatMap(([group, entries]) =>
        entries.map(({ name }) => ({ name, group, family: 'gear' as const })),
    ),
    ...Object.entries(weaponNames.groups).flatMap(([group, entries]) =>
        entries.map(({ name }) => ({ name, group, family: 'weapon' as const })),
    ),
    ...Object.entries(spiritNames.groups).flatMap(([group, entries]) =>
        entries.map(({ name }) => ({ name, group, family: 'lingshi' as const })),
    ),
];
function lines(rows: string[]): OcrLine[] {
    return rows.map((text, i) => ({
        text,
        x: 110,
        y: i * 16,
        width: 190,
        height: 13,
        score: 0.98,
    }));
}

// 按用户提供的十二种装备浮片转录，重复上传的耳饰与鞋子共用同一份口径。
const samples: { name: string; slot: GearSlotName; rows: string[]; stat: [string, string] }[] = [
    {
        name: '水晶帽',
        slot: '头',
        rows: [
            '水晶帽',
            '[装备条件] 等级60',
            '[装备角色] 男',
            '等级60',
            '魔法+60 防御+26',
            '耐久度191',
            '锻炼等级6 镶嵌宝石 红玛瑙',
            '命中+150',
            '套装效果：附加状态碎星诀',
        ],
        stat: ['命中', '+150'],
    },
    {
        name: '万里卷云',
        slot: '项链',
        rows: [
            '万里卷云',
            '[装备条件] 等级80',
            '等级80',
            '灵力+115',
            '耐久度412',
            '锻炼等级3 镶嵌宝石 舍利子',
            '特效：专注',
        ],
        stat: ['灵力', '+115'],
    },
    {
        name: '混元金锤',
        slot: '武器',
        rows: [
            '混元金锤',
            '[装备角色] 神天兵，虎头怪',
            '等级130 五行火',
            '命中+588 伤害+508',
            '耐久度387',
            '锻炼等级4 镶嵌宝石太阳石红玛瑙',
            '制造者：Jsut°画晚强化打造',
        ],
        stat: ['伤害', '+508'],
    },
    {
        name: '蝉翼金丝甲',
        slot: '衣服',
        rows: [
            '蝉翼金丝甲',
            '[装备条件] 等级130',
            '[装备角色] 男',
            '等级130 五行水',
            '气血+160 防御+229',
            '耐久度175',
            '锻炼等级4 镶嵌宝石光芒石',
            '力量+28',
            '特效：易修理',
            '开运孔数：1孔/5孔',
        ],
        stat: ['力量', '+28'],
    },
    {
        name: '攫魂铃',
        slot: '腰带',
        rows: [
            '攫魂铃',
            '[装备条件] 等级60',
            '等级60',
            '气血+360 防御+33',
            '耐久度219',
            '锻炼等级6 镶嵌宝石光芒石',
            '套装效果：附加状态碎星诀',
        ],
        stat: ['气血', '+360'],
    },
    {
        name: '追星踏月',
        slot: '鞋子',
        rows: [
            '追星踏月',
            '[装备条件] 等级60',
            '等级60',
            '敏捷+27 防御+31',
            '耐久度180',
            '锻炼等级4 镶嵌宝石黑宝石',
            '速度+32',
            '套装效果：附加状态碎星诀',
        ],
        stat: ['速度', '+32'],
    },
    {
        name: '明月珰',
        slot: '耳饰',
        rows: [
            '明月珰',
            '[装备条件] 等级80',
            '[灵饰类型] 耳饰',
            '等级80',
            '法术防御+17',
            '耐久度227',
            '精炼等级2',
            '伤害+8 [+8]',
            '封印命中等级+8 [+8]',
            '速度+8 [+6]',
            '特效：心狠手辣（1级）',
            '攻击对方孩子单位时，忽略2点防御和法术防御。',
        ],
        stat: ['速度', '+8'],
    },
    {
        name: '逸云佩',
        slot: '配饰',
        rows: [
            '逸云佩',
            '[装备条件] 等级80',
            '[灵饰类型] 佩饰',
            '等级80',
            '速度+15',
            '耐久度95',
            '精炼等级2',
            '法术防御+16 [+16]',
            '气血+157 [+56]',
            '气血回复效果+8 [+8]',
        ],
        stat: ['气血', '+157'],
    },
    {
        name: '芙蓉戒',
        slot: '戒指',
        rows: [
            '芙蓉戒',
            '[装备条件] 等级80',
            '[灵饰类型] 戒指',
            '等级80',
            '伤害+20',
            '耐久度413',
            '封印命中等级+10',
            '速度+7',
            '特效：移形换影（1级）',
            '使用移形换影后10%几率回复8点愤怒。',
        ],
        stat: ['速度', '+7'],
    },
    {
        name: '墨影扣',
        slot: '手镯',
        rows: [
            '墨影扣',
            '[装备条件] 等级100',
            '[灵饰类型] 手镯',
            '等级100',
            '抵抗封印命中等级+20',
            '耐久度440',
            '精炼等级3',
            '气血回复效果+10 [+12]',
            '防御+23 [+24]',
            '法术防御+21 [+24]',
            '特效：固若金汤（1级）',
            '抗物理暴击等级+2',
        ],
        stat: ['防御', '+23'],
    },
    {
        name: '上古玉魄·阳',
        slot: '玉魄·阳',
        rows: [
            '上古玉魄·阳',
            '封印命中等级+15',
            '奇袭法术+0.5%',
            '耐久度253',
            '灵尘等级2',
            '物理暴击等级+6 [+12]',
            '速度+5 [+9]',
            '奇袭特技：[空]',
        ],
        stat: ['奇袭法术', '+0.5%'],
    },
    {
        name: '上古玉魄·阴',
        slot: '玉魄·阴',
        rows: [
            '上古玉魄·阴',
            '格挡值+31',
            '奇袭法术+0.5%',
            '耐久度260',
            '灵尘等级2',
            '气血回复效果+9 [+12]',
            '气血+41 [+84]',
            '奇袭道具：[空]',
        ],
        stat: ['气血', '+41'],
    },
];

describe('装备浮片解析', () => {
    it.each(samples)('$name 识别部位、名称和属性', ({ name, slot, rows, stat }) => {
        const result = parseGearPanel(lines(rows), names);
        expect(result.slot).toBe(slot);
        expect(result.detail.name).toBe(name);
        expect(result.detail.stats).toContainEqual(
            expect.objectContaining({ label: stat[0], value: stat[1] }),
        );
        expect(result.hit).toBeGreaterThan(0);
    });
    it('同排多属性与灵饰方括号分别保留，不混进效果说明中的数字', () => {
        const head = parseGearPanel(lines(samples[0].rows), names).detail;
        expect(head.stats?.slice(0, 2)).toEqual([
            { label: '魔法', value: '+60' },
            { label: '防御', value: '+26' },
        ]);
        expect(head.cond).toContainEqual({ label: '镶嵌宝石', value: '红玛瑙' });
        expect(head.lines).toContainEqual({
            label: '套装',
            value: '附加状态碎星诀',
            tone: 'ochre',
        });
        const spirit = parseGearPanel(lines(samples[6].rows), names).detail;
        expect(spirit.stats).toHaveLength(4);
        expect(spirit.stats).toContainEqual({
            label: '速度',
            value: '+8',
            extra: '+6',
            gain: true,
        });
        expect(spirit.lines).toContainEqual({
            label: '特效',
            value: '心狠手辣(1级)',
            tone: 'ochre',
        });
    });
    it('标签、数值和附加值分框仍按坐标配回，不依赖 OCR 返回顺序', () => {
        const raw = lines(['上古玉魄·阴', '气血']);
        raw.push({ ...raw[1], text: '+41', x: 150, width: 30 });
        raw.push({ ...raw[1], text: '[+84]', x: 190, width: 40 });
        expect(parseGearPanel(raw.reverse(), names).detail.stats).toEqual([
            { label: '气血', value: '+41', extra: '+84', gain: true },
        ]);
    });
    it('唯一的单字误识别可回到名录，衣服和腰带不按共同属性互猜', () => {
        expect(
            parseGearPanel(lines(['摄魂铃', '[装备条件] 等级60', '气血+360 防御+33']), names).slot,
        ).toBe('腰带');
        expect(parseGearPanel(lines(['气血+360 防御+33']), names).slot).toBeNull();
        expect(parseGearPanel(lines(['气血+360 防御+33']), names, '衣服').slot).toBe('衣服');
        expect(parseGearPanel([], names, '头').hit).toBe(0);
    });
    it('玉魄的空奇袭归一为空，不把方括号当作已装备的道具', () => {
        expect(parseGearPanel(lines(samples[11].rows), names).detail.lines).toContainEqual({
            label: '奇袭道具',
            value: '空',
            tone: 'ochre',
        });
    });
});

describe('套装效果写入', () => {
    it('分框逆序或漏读冒号时保留完整内容，空标签不当成效果', () => {
        const raw = lines(['水晶帽', '套装效果：']);
        raw.push({ ...raw[1], x: 185, text: '附加状态碎星诀' });
        expect(parseGearPanel(raw.reverse(), names).detail.lines).toEqual([
            { label: '套装', value: '附加状态碎星诀', tone: 'ochre' },
        ]);
        expect(
            parseGearPanel(lines(['水晶帽', '套装效果附加状态碎星诀']), names).detail.lines,
        ).toEqual([{ label: '套装', value: '附加状态碎星诀', tone: 'ochre' }]);
        expect(parseGearPanel(lines(['水晶帽', '套装效果：']), names).detail.lines).toBeUndefined();
    });
});

describe('装备按部位覆盖', () => {
    const seed: GearSlot = {
        slot: '戒指',
        caption: '自用戒指',
        detail: {
            name: '芙蓉戒',
            kind: '灵饰 · 戒指',
            requires: ['等级 80', '五行 木'],
            flavor: '保留描述',
            note: '自用戒指\n以后换三伤害',
            stats: [
                { label: '伤害', value: '+20' },
                { label: '伤害', value: '+8', extra: '+8', gain: true },
                { label: '伤害', value: '+9', extra: '+8', gain: true },
            ],
            cond: [{ label: '钟灵石', value: '健步如飞 4段' }],
            lines: [{ label: '特效', value: '移形换影', tone: 'ochre' }],
        },
    };
    it('整件覆盖旧属性和效果，仅保留自用备注，重复识别不增加行', () => {
        const patch = parseGearPanel(
            lines(['[灵饰类型]戒指', '精炼等级2', '伤害+11', '伤害+12']),
            names,
        );
        const merged = mergeGearPanel(seed, patch);
        expect(merged.detail?.stats).toEqual([
            { label: '伤害', value: '+11', gain: true },
            { label: '伤害', value: '+12', gain: true },
        ]);
        expect(merged.caption).toBe('');
        expect(merged.detail?.cond).toEqual([{ label: '精炼等级', value: '2' }]);
        expect(merged.detail?.flavor).toBeUndefined();
        expect(merged.detail?.note).toBe(seed.detail?.note);
        expect(merged.detail?.lines).toBeUndefined();
        expect(merged.detail?.requires).toBeUndefined();
        expect(mergeGearPanel(merged, patch)).toEqual(merged);
        expect(seed.detail?.stats[1].value).toBe('+8');
    });
    it('新截图不继承旧名称和手工分类，不残留旧词条', () => {
        const original: GearSlot = {
            slot: '头',
            detail: {
                name: '水晶帽',
                kind: '头盔',
                stats: [
                    { label: '防御', value: '+45', group: 'base' },
                    { label: '伤害', value: '+40', group: 'gem' },
                ],
            },
        };
        const patch = parseGearPanel(lines(['防御+46', '伤害+48']), names, '头');
        expect(patch.detail.kind).toBeUndefined();
        const merged = mergeGearPanel(original, patch);
        expect(merged.detail?.kind).toBe('');
        expect(merged.detail?.name).toBe('');
        expect(merged.detail?.stats).toEqual([
            { label: '防御', value: '+46' },
            { label: '伤害', value: '+48' },
        ]);
        expect(mergeGearPanel(merged, patch)).toEqual(merged);
        expect(original.detail?.stats[0].value).toBe('+45');
        merged.detail!.stats[0].value = '+99';
        expect(patch.detail.stats?.[0].value).toBe('+46');
    });
    it('部位不符及空识别不修改当前装备', () => {
        expect(mergeGearPanel(seed, parseGearPanel(lines(samples[0].rows), names))).toBe(seed);
        expect(mergeGearPanel(seed, parseGearPanel([], names))).toBe(seed);
    });
});
