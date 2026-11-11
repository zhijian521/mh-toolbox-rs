import { describe, expect, it } from 'vitest';
import gearNames from '../../../../public/game/data/gear-icons.json';
import weaponNames from '../../../../public/game/data/weapon-icons.json';
import spiritNames from '../../../../public/game/data/lingshi-icons.json';
import type { EquipmentName } from '../../../services/game-data';
import { GEAR_JADE_EFFECTS, GEAR_TRAITS, type GearSlot, type GearSlotName } from '../gear';
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
    it.each([
        ['变身术之猫灵(人型)', ['套装效果：变身术之猫灵（人', '型）']],
        ['变身术之修罗傀儡鬼', ['套装效果：变身术之修罗傀儡', '鬼']],
        ['变身术之修罗傀儡鬼', ['套装效果：变身术之修罗愧', '鬼']],
        ['附加状态碎星诀', ['套装效果：附加状态', '碎星诀']],
        ['变身术之猫灵(人型)', ['套装效果：', '变身术之猫灵（', '人', '型）']],
    ] as const)('套装名称跨行拼完整：%s', (expected, wrapped) => {
        const result = parseGearPanel(
            lines([
                '白玉龙冠',
                '魔法+96防御+242',
                '耐久度332',
                '特技：凝滞术',
                '特效：无级别限制',
                ...wrapped,
                '开运孔数：3孔/3孔',
                '符石：气血+15速度+1.5',
                '符石组合：心随我动',
                '制造者：测试',
                '熔炼效果：+11防御-22魔法',
            ]).reverse(),
            names,
        ).detail;
        expect(result.lines).toEqual([
            { label: '特技', value: '凝滞术', tone: 'seal' },
            { label: '特效', value: '无级别限制', tone: 'ochre' },
            { label: '套装', value: expected, tone: 'ochre' },
            { label: '符石组合', value: '心随我动', tone: 'ochre' },
        ]);
        expect(result.cond).toContainEqual({ label: '开运孔数', value: '3孔/3孔' });
        expect(result.stats?.filter((row) => row.group === 'melt')).toEqual([
            { label: '防御', value: '+11', group: 'melt', gain: true },
            { label: '魔法', value: '-22', group: 'melt', gain: true },
        ]);
    });

    it('套装续行不跨列、远距离或新属性字段，也不吞已闭合括号后的说明', () => {
        const source = lines(['白玉龙冠', '套装效果：变身术之猫灵(人', '型)']);
        for (const changed of [
            { ...source[2], x: 600 },
            { ...source[2], y: 160 },
        ]) {
            expect(
                parseGearPanel([...source.slice(0, 2), changed], names).detail.lines?.[0].value,
            ).toBe('变身术之猫灵(人');
        }
        const bounded = parseGearPanel(
            lines(['白玉龙冠', '套装效果：变身术之猫灵(人型)', '说明文字', '穿刺效果+0.88%']),
            names,
        ).detail;
        expect(bounded.lines?.[0].value).toBe('变身术之猫灵(人型)');
        expect(bounded.stats).toEqual([{ label: '穿刺效果', value: '+0.88%', group: 'trait' }]);
    });

    it.each(GEAR_TRAITS)('160 蓝字 %s 独立归特性，保留小数与百分号', (label) => {
        const result = parseGearPanel(
            lines([
                '鎏金浣月衣',
                '等级160',
                '防御+489',
                '耐久度196',
                '耐力+38力量+36',
                `${label}+0.88%`,
            ]),
            names,
        ).detail;
        expect(result.stats).toContainEqual({ label, value: '+0.88%', group: 'trait' });
        expect(result.stats?.filter((row) => row.gain).map((row) => row.label)).toEqual([
            '耐力',
            '力量',
        ]);
    });

    it('换行套装之后的160特性和熔炼同时保留，符石属性仍排除', () => {
        const result = parseGearPanel(
            lines([
                '鎏金浣月衣',
                '等级160',
                '防御+489',
                '耐久度196',
                '锻炼等级16',
                '耐力+38力量+36',
                '套装效果：变身术之修罗傀儡',
                '鬼',
                '穿刺效果+0.88%',
                '开运孔数：5孔/5孔',
                '符石：敏捷+1伤害+1.5',
                '符石组合：天降大任',
                '制造者：测试',
                '熔炼效果：',
                '+21防御',
            ]),
            names,
        ).detail;
        expect(result.lines).toContainEqual({
            label: '套装',
            value: '变身术之修罗傀儡鬼',
            tone: 'ochre',
        });
        expect(result.stats?.filter((row) => row.group === 'trait')).toEqual([
            { label: '穿刺效果', value: '+0.88%', group: 'trait' },
        ]);
        expect(result.stats?.filter((row) => row.group === 'melt')).toEqual([
            { label: '防御', value: '+21', group: 'melt', gain: true },
        ]);
        expect(result.stats?.some((row) => row.label === '敏捷')).toBe(false);
    });

    it.each(GEAR_JADE_EFFECTS)('玉魄蓝字 %s 在奇袭道具之后仍识别，不按灵尘补强化', (label) => {
        const result = parseGearPanel(
            lines([
                '上古玉魄·阴',
                '法术防御+22',
                '耐久度300',
                '灵尘等级2',
                '法术防御+10[+24]',
                '法术防御+14[+24]',
                '奇袭道具：[空]',
                `${label}+2.1%`,
            ]),
            names,
        ).detail;
        expect(result.stats?.at(-1)).toEqual({
            label,
            value: '+2.1%',
            ...(label === '奇袭法术' ? {} : { group: 'trait' }),
        });
        expect(result.stats?.at(-1)?.extra).toBeUndefined();
        expect(result.stats?.at(-1)?.gain).toBeUndefined();
        expect(result.stats?.filter((row) => row.extra)).toHaveLength(2);
        expect(result.lines).toContainEqual({ label: '奇袭道具', value: '空', tone: 'ochre' });
    });

    it('奇袭法术在强化前后均不带附加标记，误读括号也不成为强化值', () => {
        const result = parseGearPanel(
            lines([
                '上古玉魄·阴',
                '奇袭法术+3%',
                '灵尘等级12',
                '奇袭道具：金香玉',
                '奇袭法术+3%[+9]',
            ]),
            names,
        ).detail;
        expect(result.stats).toEqual([
            { label: '奇袭法术', value: '+3%' },
            { label: '奇袭法术', value: '+3%' },
        ]);
    });

    it.each([
        {
            title: '霹雳',
            rows: [
                '魔力+18敏捷-2',
                '开运孔数：4孔/4孔',
                '符石：防御+3',
                '制造者：测试',
                '熔炼效果：',
                '+1魔力',
            ],
            expected: [{ label: '魔力', value: '+1', group: 'melt', gain: true }],
        },
        {
            title: '紫金磐龙甲',
            rows: [
                '力量+36体质+34',
                '开运孔数：5孔/5孔',
                '符石：体质+1命中+4',
                '制造者：测试',
                '熔炼效果：',
                '-1体质+12防御',
            ],
            expected: [
                { label: '体质', value: '-1', group: 'melt', gain: true },
                { label: '防御', value: '+12', group: 'melt', gain: true },
            ],
        },
    ])('$title 在符石之后仍识别熔炼，不改基础和附加原值', ({ title, rows, expected }) => {
        const result = parseGearPanel(lines([title, ...rows]), names).detail;
        expect(result.stats?.filter((row) => row.group === 'melt')).toEqual(expected);
        expect(result.stats).toHaveLength(expected.length + 2);
        expect(result.stats?.slice(0, 2).map((row) => row.value)).toEqual(
            title === '霹雳' ? ['+18', '-2'] : ['+36', '+34'],
        );
    });
    it('熔炼标签同排或换行，属性和值分框时都保留正负号及逐项分类', () => {
        const raw = lines(['紫金磐龙甲', '熔炼效果：', '-1', '+12']);
        raw.push({ ...raw[2], text: '体质', x: 150 });
        raw.push({ ...raw[3], text: '防御', x: 150 });
        expect(parseGearPanel(raw.reverse(), names).detail.stats).toEqual([
            { label: '体质', value: '-1', group: 'melt', gain: true },
            { label: '防御', value: '+12', group: 'melt', gain: true },
        ]);
        expect(
            parseGearPanel(lines(['霹雳', '熔炼效果：魔力+1敏捷-2']), names).detail.stats,
        ).toEqual([
            { label: '魔力', value: '+1', group: 'melt', gain: true },
            { label: '敏捷', value: '-2', group: 'melt', gain: true },
        ]);
        expect(parseGearPanel(lines(['霹雳', '熔炼效果+1魔力']), names).detail.stats).toEqual([
            { label: '魔力', value: '+1', group: 'melt', gain: true },
        ]);
    });
    it('没有熔炼标题不猜数值，熔炼区域的空行、未知词条和说明不生成属性', () => {
        expect(parseGearPanel(lines(['霹雳', '+1魔力']), names).detail.stats).toBeUndefined();
        const rows = ['霹雳', '熔炼效果：', '未知属性+3', '最多增加防御12点', '+', '符石：魔力+1'];
        expect(parseGearPanel(lines(rows), names).detail.stats).toBeUndefined();
        expect(
            parseGearPanel(lines(['霹雳', '熔炼效果：+0魔力,-1.5敏捷']), names).detail.stats,
        ).toEqual([
            { label: '魔力', value: '+0', group: 'melt', gain: true },
            { label: '敏捷', value: '-1.5', group: 'melt', gain: true },
        ]);
    });
    it('符石属性、星位、星相与组合说明不进附加，只保留组合名称', () => {
        const result = parseGearPanel(
            lines([
                '天龙破城',
                '等级150',
                '伤害+731命中+561',
                '耐久度59',
                '锻炼等级13镶嵌宝石太阳石',
                '耐力+30体质+29',
                '开运孔数：5孔/5孔（双5孔）',
                '符石：气血+15速度+1.5',
                '气血+15速度+1.5',
                '星位：伤害+2.5',
                '星相互合：体质+2',
                '符石组合：高山流水',
                '法术伤害+30',
                '制造者：测试强化打造',
            ]),
            names,
        ).detail;
        expect(result.stats).toEqual([
            { label: '伤害', value: '+731' },
            { label: '命中', value: '+561' },
            { label: '耐力', value: '+30', gain: true },
            { label: '体质', value: '+29', gain: true },
        ]);
        expect(result.lines).toEqual([{ label: '符石组合', value: '高山流水', tone: 'ochre' }]);
        expect(result.foot).toBe('制造者：测试强化打造');
    });
    it('符石标签纵向合框或开运漏读时，按区域排除脱离前缀的属性', () => {
        const raw = lines(['天龙破城', '耐力+30', '气血1+15速度+1.5', '符石组合高山流水']);
        raw.push({ ...raw[2], text: '符符符符符星', x: 50, y: 29, width: 20, height: 80 });
        expect(parseGearPanel(raw, names).detail.stats).toEqual([{ label: '耐力', value: '+30' }]);
        expect(parseGearPanel(raw, names).detail.lines).toEqual([
            { label: '符石组合', value: '高山流水', tone: 'ochre' },
        ]);
    });
    it('等级进自己的数字格，五行与装备角色仍留在条件里', () => {
        const head = parseGearPanel(lines(samples[0].rows), names).detail;
        expect(head.level).toBe(60);
        expect(head.requires).toEqual(['男']);
        const weapon = parseGearPanel(lines(samples[2].rows), names).detail;
        expect(weapon.level).toBe(130);
        /* `compact()` 会把全角逗号归一成半角（NFKC），这里按归一化后的文本断言。 */
        expect(weapon.requires).toEqual(['神天兵,虎头怪', '五行 火']);
    });
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
        expect(spirit.cond).toContainEqual({
            label: '钟灵石',
            value: '心狠手辣(1级)',
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
    it('钟灵石只记名称和等级，后面的属性说明不混入附加', () => {
        const result = parseGearPanel(
            lines(samples[9].rows.map((row) => row.replace('抵抗封印命中等级', '抵抗封印等级'))),
            names,
        ).detail;
        expect(result.stats).toHaveLength(4);
        expect(result.stats?.[0]).toEqual({ label: '抵抗封印命中等级', value: '+20' });
        expect(result.stats?.some((row) => row.label === '抗物理暴击等级')).toBe(false);
        expect(result.cond).toContainEqual({ label: '钟灵石', value: '固若金汤(1级)' });
        expect(result.lines).toBeUndefined();
        expect(
            parseGearPanel(
                lines(['[灵饰类型]手镯', '防御+20', '钟灵石：固若金汤（1级）', '防御+2']),
            ).detail.stats,
        ).toEqual([{ label: '防御', value: '+20' }]);
    });
    it('星辉石按精炼等级补缺失括号，同名附加逐条补且不强化主属性', () => {
        const detail = parseGearPanel(
            lines([
                '[灵饰类型]戒指',
                '伤害+20',
                '耐久度200',
                '精炼等级3',
                '伤害+10',
                '伤害+11',
                '速度+8',
                '治疗能力+9',
                '狂暴等级+7',
                '法术伤害结果+8',
                '穿刺等级+9',
            ]),
        ).detail;
        expect(detail.stats).toEqual([
            { label: '伤害', value: '+20' },
            { label: '伤害', value: '+10', gain: true, extra: '+12' },
            { label: '伤害', value: '+11', gain: true, extra: '+12' },
            { label: '速度', value: '+8', gain: true, extra: '+9' },
            { label: '治疗能力', value: '+9', gain: true, extra: '+9' },
            { label: '狂暴等级', value: '+7', gain: true, extra: '+9' },
            { label: '法术伤害结果', value: '+8', gain: true, extra: '+9' },
            { label: '穿刺等级', value: '+9', gain: true, extra: '+12' },
        ]);
    });
    it('五色灵尘按显示等级和每级系数补算，保留半点，不重复叠加赠送等级', () => {
        const detail = parseGearPanel(
            lines(['上古玉魄·阳', '治疗能力+15', '灵尘等级3', '治疗能力+6', '速度+5']),
        ).detail;
        expect(detail.stats).toEqual([
            { label: '治疗能力', value: '+15' },
            { label: '治疗能力', value: '+6', gain: true, extra: '+13.5' },
            { label: '速度', value: '+5', gain: true, extra: '+13.5' },
        ]);
        expect(
            parseGearPanel(
                lines(['上古玉魄·阴', '灵尘等级2', '气血+41', '防御+9', '气血回复效果+8']),
            ).detail.stats?.map((row) => row.extra),
        ).toEqual(['+84', '+24', '+12']);
    });
    it('成功识别的强化值优先，缺等级、未知系数及百分比不猜值', () => {
        expect(
            parseGearPanel(lines(['[灵饰类型]戒指', '精炼等级3', '速度+7[+8]', '穿刺效果+1%']))
                .detail.stats,
        ).toEqual([
            { label: '速度', value: '+7', extra: '+8', gain: true },
            { label: '穿刺效果', value: '+1%', gain: true },
        ]);
        expect(
            parseGearPanel(lines(['上古玉魄·阴', '灵尘等级2', '灵力+8'])).detail.stats?.[0].extra,
        ).toBeUndefined();
        expect(
            parseGearPanel(lines(['[灵饰类型]戒指', '耐久度200', '伤害+8'])).detail.stats?.[0]
                .extra,
        ).toBeUndefined();
        expect(
            parseGearPanel(lines(['混元金锤', '锻炼等级4', '伤害+508']), names).detail.stats?.[0]
                .extra,
        ).toBeUndefined();
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
            level: 80,
            requires: ['五行 木'],
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
            { label: '伤害', value: '+11', gain: true, extra: '+8' },
            { label: '伤害', value: '+12', gain: true, extra: '+8' },
        ]);
        expect(merged.caption).toBe('');
        expect(merged.detail?.cond).toEqual([{ label: '精炼等级', value: '2' }]);
        expect(merged.detail?.flavor).toBeUndefined();
        expect(merged.detail?.note).toBe(seed.detail?.note);
        expect(merged.detail?.lines).toBeUndefined();
        expect(merged.detail?.requires).toBeUndefined();
        expect(merged.detail?.level).toBeUndefined();
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
