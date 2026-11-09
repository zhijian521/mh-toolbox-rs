import { describe, expect, it } from 'vitest';
import { normalizeGearDetail } from './details';
import {
    gearConditionOptions,
    gearEffectOptions,
    gearGroupOptions,
    gearPropertyGroups,
    gearStatGroup,
    gearStatHasExtra,
    gearStatOptions,
    withGearBaseStats,
} from './gear-properties';
import { GEAR_JADE_EFFECTS, GEAR_TRAITS, type GearDetail } from './gear';

describe('按部位选择装备属性', () => {
    const values = (rows: { value: string }[]) => rows.map((row) => row.value);
    it('基础、附加和宝石分别按部位提供，不把其他部位词条混进来', () => {
        expect(values(gearStatOptions('武器', 'base'))).toEqual(['命中', '伤害']);
        expect(values(gearStatOptions('衣服', 'extra'))).toContain('耐力');
        expect(values(gearStatOptions('头', 'base'))).toEqual(['防御', '魔法']);
        expect(values(gearGroupOptions('戒指'))).not.toContain('gem');
        expect(values(gearStatOptions('戒指', 'extra'))).toContain('治疗能力');
        expect(values(gearStatOptions('配饰', 'extra'))).not.toContain('伤害');
        expect(values(gearStatOptions('玉魄·阴', 'extra'))).toContain('气血回复效果');
        expect(values(gearStatOptions('玉魄·阳', 'extra'))).toContain('速度');
        expect(values(gearStatOptions('玉魄·阳', 'base'))).toContain('奇袭法术');
        expect(values(gearStatOptions('玉魄·阴', 'base'))).toContain('奇袭法术');
    });
    it('养成和特殊行的选项跟随装备类别', () => {
        expect(values(gearConditionOptions('头'))).toContain('镶嵌宝石');
        expect(values(gearConditionOptions('耳饰'))).toContain('精炼等级');
        expect(values(gearConditionOptions('玉魄·阳'))).toEqual(['耐久度', '灵尘等级']);
        expect(values(gearEffectOptions('玉魄·阴'))).toEqual(['奇袭道具']);
        expect(values(gearEffectOptions('玉魄·阳'))).toEqual(['奇袭特技']);
        expect(values(gearEffectOptions('武器'))).toContain('符石组合');
        expect(values(gearEffectOptions('戒指'))).not.toContain('符石组合');
        expect(values(gearConditionOptions('武器'))).not.toContain('符石');
    });
    it('普通装备提供160特性，玉魄提供自身六种特效，灵饰不混入这些选项', () => {
        expect(values(gearStatOptions('衣服', 'trait'))).toEqual([...GEAR_TRAITS]);
        expect(values(gearStatOptions('玉魄·阴', 'trait'))).toEqual([...GEAR_JADE_EFFECTS]);
        expect(values(gearStatOptions('耳饰', 'trait'))).toEqual([]);
        expect(gearGroupOptions('衣服')).toContainEqual({ value: 'trait', label: '160特性' });
        expect(gearGroupOptions('玉魄·阳')).toContainEqual({ value: 'trait', label: '玉魄特效' });
    });
    it('奇袭法术与蓝字特效永远只有单值框，普通玉魄加成仍有强化框', () => {
        for (const label of GEAR_JADE_EFFECTS) {
            expect(
                gearStatHasExtra({ label, value: '+3%', gain: true, extra: '' }, '玉魄·阴'),
            ).toBe(false);
        }
        expect(
            gearStatHasExtra({ label: '穿刺效果', value: '+0.88%', group: 'trait' }, '衣服'),
        ).toBe(false);
        expect(gearStatHasExtra({ label: '法术防御', value: '+14', gain: true }, '玉魄·阴')).toBe(
            true,
        );
    });
});

describe('手动录入的基础属性', () => {
    const empty = (): GearDetail => ({ name: '', kind: '', stats: [] });
    it.each([
        ['头', ['防御', '魔法']],
        ['项链', ['灵力']],
        ['武器', ['命中', '伤害']],
        ['衣服', ['防御']],
        ['腰带', ['防御', '气血']],
        ['鞋子', ['防御', '敏捷']],
    ] as const)('%s 自动列出固定基础属性，不填虚假数值', (slot, labels) => {
        const original = empty();
        const prepared = withGearBaseStats(original, slot);
        expect(prepared.stats.map((row) => row.label)).toEqual(labels);
        expect(prepared.stats.every((row) => row.value === '' && row.group === 'base')).toBe(true);
        expect(original.stats).toEqual([]);
        expect(withGearBaseStats(prepared, slot)).toBe(prepared);
    });
    it('灵饰主属性二选一，只补一个；已有主属性和数值保留', () => {
        expect(withGearBaseStats(empty(), '耳饰').stats.map((row) => row.label)).toEqual([
            '法术伤害',
        ]);
        const detail: GearDetail = {
            name: '明月珰',
            kind: '耳饰',
            stats: [{ label: '法术防御', value: '+17' }],
        };
        expect(withGearBaseStats(detail, '耳饰')).toBe(detail);
        expect(withGearBaseStats(empty(), '玉魄·阳').stats.map((row) => row.label)).toEqual([
            '伤害',
            '奇袭法术',
        ]);
    });
    it('保存时忽略未填的基础输入框，已填的 0 与截图值保留', () => {
        const detail = withGearBaseStats(
            { name: '水晶帽', kind: '头盔', stats: [{ label: '防御', value: '0', group: 'base' }] },
            '头',
        );
        expect(normalizeGearDetail(detail)?.stats).toEqual([
            expect.objectContaining({ label: '防御', value: '0', group: 'base' }),
        ]);
        expect(detail.stats).toHaveLength(2);
    });
    it('已有奇袭法术不因旧附加标记或特效分类再补一个空框', () => {
        for (const stat of [
            { label: '奇袭法术', value: '+3%', gain: true },
            { label: '奇袭法术', value: '+3%', group: 'trait' as const },
        ]) {
            const prepared = withGearBaseStats(
                { name: '上古玉魄·阴', kind: '玉魄', stats: [stat] },
                '玉魄·阴',
            );
            expect(prepared.stats.filter((row) => row.label === '奇袭法术')).toEqual([stat]);
        }
    });
});

describe('装备属性分类展示', () => {
    it('160特性和玉魄特效独立展示，保存重载保留百分比，不保留无效强化值', () => {
        for (const [slot, label, groupLabel] of [
            ['衣服', '穿刺效果', '160特性'],
            ['玉魄·阴', '法伤化劲', '玉魄特效'],
        ] as const) {
            const detail = normalizeGearDetail({
                name: '测试',
                kind: slot,
                stats: [{ label, value: '+2.1%', group: 'trait', extra: '+99' }],
            })!;
            const group = gearPropertyGroups(detail, slot, true).find(
                (one) => one.key === 'trait',
            )!;
            expect(group.label).toBe(groupLabel);
            expect(group.inline).toBe(false);
            expect(group.items[0].row).toBe(detail.stats[0]);
            expect(group.items[0].value).toBe('+2.1%');
            expect(detail.stats[0].extra).toBeUndefined();
            expect(normalizeGearDetail(JSON.parse(JSON.stringify(detail)))?.stats).toEqual(
                detail.stats,
            );
        }
        const ambush = normalizeGearDetail({
            name: '上古玉魄·阴',
            kind: '玉魄',
            stats: [{ label: '奇袭法术', value: '+3%', extra: '+9', gain: true }],
        })!;
        expect(ambush.stats[0].extra).toBeUndefined();
        expect(gearPropertyGroups(ambush, '玉魄·阴')[0].label).toBe('奇袭');
        expect(gearStatGroup({ label: '法伤化劲', value: '+2.1%' }, '玉魄·阴')).toBe('trait');
        expect(gearStatGroup({ label: '穿刺效果', value: '+0.88%' }, '衣服')).toBe('trait');
        expect(gearStatGroup({ label: '物理暴击等级', value: '+8', gain: true }, '戒指')).toBe(
            'extra',
        );
    });
    it('熔炼单独展示并保留负数，不与同名基础或附加合并', () => {
        const detail = normalizeGearDetail({
            name: '紫金磐龙甲',
            kind: '铠甲',
            stats: [
                { label: '防御', value: '+282', group: 'base' },
                { label: '体质', value: '+34', gain: true },
                { label: '体质', value: '-1', group: 'melt', gain: true },
                { label: '防御', value: '+12', group: 'melt', gain: true },
            ],
        })!;
        const groups = gearPropertyGroups(detail, '衣服', true);
        const melt = groups.find((group) => group.key === 'melt')!;
        expect(melt.label).toBe('熔炼');
        expect(melt.items.map((item) => [item.row.label, item.value])).toEqual([
            ['体质', '-1'],
            ['防御', '+12'],
        ]);
        expect(groups.find((group) => group.key === 'base')?.items[0].value).toBe('+282');
        expect(groups.find((group) => group.key === 'extra')?.items[0].value).toBe('+34');
        expect(normalizeGearDetail(JSON.parse(JSON.stringify(detail)))?.stats).toEqual(
            detail.stats,
        );
    });
    it('符石组合独立成行并保留名称，编辑与展示引用同一项', () => {
        const detail: GearDetail = {
            name: '天龙破城',
            kind: '枪矛',
            stats: [{ label: '耐力', value: '+30', gain: true }],
            lines: [{ label: '符石组合', value: '高山流水', tone: 'ochre' }],
        };
        const group = gearPropertyGroups(detail, '武器', true).find(
            (one) => one.label === '符石组合',
        )!;
        expect(group.kind).toBe('upgrade');
        expect(group.tag).toBe(true);
        expect(group.items).toHaveLength(1);
        expect(group.items[0].row).toBe(detail.lines![0]);
        expect(group.items[0].value).toBe('高山流水');
        expect(gearEffectOptions('武器').find((one) => one.value === '符石组合')?.kind).toBe(
            group.kind,
        );
    });
    it('基础保留并排布局，套装、特技、特效各有分类和底色标签', () => {
        const detail: GearDetail = {
            name: '水晶帽',
            kind: '头盔',
            stats: [
                { label: '魔法', value: '+60' },
                { label: '防御', value: '+26' },
                { label: '命中', value: '+150', gain: true },
            ],
            lines: [
                { label: '套装', value: '附加状态碎星诀' },
                { label: '特技', value: '起死回生' },
                { label: '特效', value: '神佑' },
            ],
        };
        const groups = gearPropertyGroups(detail, '头', true);
        expect(groups.find((group) => group.key === 'base')?.inline).toBe(true);
        expect(groups.find((group) => group.key === 'base')?.items).toHaveLength(2);
        expect(
            groups
                .filter((group) => group.key.startsWith('line-'))
                .map(({ kind, tag }) => ({ kind, tag })),
        ).toEqual([
            { kind: 'suit', tag: true },
            { kind: 'active', tag: true },
            { kind: 'effect', tag: true },
        ]);
        expect(groups.find((group) => group.key === 'gem')?.kind).toBe('gem');
    });
    it('灵饰重复附加逐条保留，分组引用原行，显示不改值', () => {
        const detail: GearDetail = {
            name: '戒指',
            kind: '灵饰 · 戒指',
            stats: [
                { label: '伤害', value: '+24' },
                { label: '治疗能力', value: '+8', extra: '+12', gain: true },
                { label: '治疗能力', value: '+7', extra: '+12', gain: true },
            ],
            cond: [
                { label: '耐久度', value: '401' },
                { label: '精炼等级', value: '4' },
            ],
            lines: [{ label: '特效', value: '再生' }],
        };
        const before = JSON.stringify(detail);
        const groups = gearPropertyGroups(detail, '戒指');
        const extra = groups.find((group) => group.key === 'extra')!;
        expect(extra.inline).toBe(false);
        expect(extra.items.map((item) => item.index)).toEqual([1, 2]);
        expect(extra.items[0].row).toBe(detail.stats[1]);
        expect(groups.find((group) => group.key === 'refine')?.items[0].value).toBe('4 段');
        expect(JSON.stringify(detail)).toBe(before);
    });
    it('宝石属性只展示已记录的行，段数不反算额外伤害', () => {
        const detail: GearDetail = {
            name: '头',
            kind: '头盔',
            stats: [
                { label: '防御', value: '+45' },
                { label: '伤害', value: '+40', group: 'gem' },
            ],
            cond: [
                { label: '锻炼等级', value: '5' },
                { label: '镶嵌宝石', value: '太阳石' },
            ],
        };
        const groups = gearPropertyGroups(detail, '头');
        expect(groups.find((group) => group.key === 'gem')?.items[0].value).toBe('+40');
        expect(
            groups.find((group) => group.key === 'forge')?.items.map((item) => item.value),
        ).toEqual(['5 段', '太阳石']);
        detail.stats.splice(1, 1);
        expect(gearPropertyGroups(detail, '头').some((group) => group.key === 'gem')).toBe(false);
    });
    it('玉魄奇袭独立展示，未知行、0、负数及空孔不丢失', () => {
        const detail: GearDetail = {
            name: '玉魄',
            kind: '上古玉魄·阳',
            stats: [
                { label: '伤害', value: '+10' },
                { label: '奇袭法术', value: '+0.5%' },
                { label: '治疗能力', value: '-1', gain: true },
            ],
            cond: [
                { label: '灵尘等级', value: '0' },
                { label: '自定义状态', value: '0' },
            ],
            lines: [{ label: '奇袭特技', value: '空' }],
        };
        const groups = gearPropertyGroups(detail, '玉魄·阳');
        expect(groups.find((group) => group.key === 'extra')?.label).toBe('加成');
        expect(groups.find((group) => group.key === 'ambush')?.items[0].name).toBe('法术');
        expect(groups.find((group) => group.key === 'dust')?.items[0].value).toBe('0 级');
        expect(groups.find((group) => group.key === 'status')?.items[0].name).toBe('自定义状态');
        expect(groups.flatMap((group) => group.items).map((item) => item.value)).toContain('空');
    });
    it('手工分类优先，归一化和序列化后仍保留；截图五维按部位归类', () => {
        const detail = normalizeGearDetail({
            name: '刀',
            kind: '刀',
            stats: [
                { label: '伤害', value: '+40', group: 'gem' },
                { label: '力量', value: '+20' },
                { label: '防御', value: '0', group: 'invalid' },
            ],
        })!;
        expect(gearStatGroup(detail.stats[0], '武器')).toBe('gem');
        expect(gearStatGroup(detail.stats[1], '武器')).toBe('extra');
        expect(detail.stats[2].group).toBeUndefined();
        expect(normalizeGearDetail(JSON.parse(JSON.stringify(detail)))?.stats[0].group).toBe('gem');
        expect(gearStatGroup({ label: '敏捷', value: '+20' }, '鞋子')).toBe('base');
        expect(gearStatGroup({ label: '速度', value: '+24' }, '鞋子')).toBe('gem');
    });
});
