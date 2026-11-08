import type { GearDetail, GearSlotName, GearStat, GearStatGroup, GearTone } from './gear';

export const GEAR_STAT_GROUPS: { value: GearStatGroup; label: string }[] = [
    { value: 'base', label: '基础' },
    { value: 'extra', label: '附加' },
    { value: 'gem', label: '宝石' },
    { value: 'melt', label: '熔炼' },
];
const FIVE_STATS = ['体质', '魔力', '力量', '耐力', '敏捷'];
const ATTACK_STATS = [
    '伤害',
    '速度',
    '法术伤害',
    '固定伤害',
    '治疗能力',
    '封印命中等级',
    '物理暴击等级',
    '法术暴击等级',
    '狂暴等级',
    '穿刺等级',
];
const DEFENSE_STATS = [
    '气血',
    '防御',
    '法术防御',
    '抵抗封印命中等级',
    '格挡值',
    '气血回复效果',
    '抗物理暴击等级',
    '抗法术暴击等级',
];
const JADE_ATTACK = ATTACK_STATS.filter(
    (label) => !['速度', '狂暴等级', '穿刺等级'].includes(label),
);

interface GearRule {
    base: string[];
    extra: string[];
    gem: string[];
}
/** 部位决定可选词条，数值只记录原值，不扣除或反算宝石。 */
const GEAR_RULES: Record<GearSlotName, GearRule> = {
    头: { base: ['防御', '魔法'], extra: [], gem: ['伤害', '命中', '防御'] },
    项链: {
        base: ['灵力'],
        extra: [],
        gem: ['灵力', '火属性吸收', '土属性吸收', '水属性吸收', '雷属性吸收'],
    },
    武器: { base: ['命中', '伤害'], extra: FIVE_STATS, gem: ['伤害', '命中', '躲避'] },
    衣服: { base: ['防御'], extra: FIVE_STATS, gem: ['气血', '防御', '灵力', '法术防御'] },
    腰带: { base: ['防御', '气血'], extra: [], gem: ['气血', '速度', '躲避'] },
    鞋子: {
        base: ['防御', '敏捷'],
        extra: [],
        gem: ['速度', '躲避', '火属性吸收', '土属性吸收', '水属性吸收', '雷属性吸收'],
    },
    戒指: { base: ['伤害', '防御'], extra: ATTACK_STATS, gem: [] },
    耳饰: { base: ['法术伤害', '法术防御'], extra: ATTACK_STATS, gem: [] },
    配饰: { base: ['速度'], extra: DEFENSE_STATS, gem: [] },
    手镯: { base: ['封印命中等级', '抵抗封印命中等级'], extra: DEFENSE_STATS, gem: [] },
    '玉魄·阴': { base: [...DEFENSE_STATS, '奇袭法术'], extra: DEFENSE_STATS, gem: [] },
    '玉魄·阳': { base: [...JADE_ATTACK, '奇袭法术'], extra: [...JADE_ATTACK, '速度'], gem: [] },
};

export function gearStatOptions(slot: GearSlotName, group: GearStatGroup) {
    const rule = GEAR_RULES[slot];
    if (
        group === 'melt' &&
        (slot.startsWith('玉魄') || ['戒指', '耳饰', '配饰', '手镯'].includes(slot))
    )
        return [];
    const labels = group === 'melt' ? [...rule.base, ...rule.extra] : rule[group];
    return [...new Set(labels)].map((value) => ({ value, label: value }));
}

/** 常规装备的基础词条固定；灵饰和玉魄主属性存在备选，只预置一项。 */
export function fixedGearBaseLabels(slot: GearSlotName): string[] {
    return slot.startsWith('玉魄') || ['戒指', '耳饰', '配饰', '手镯'].includes(slot)
        ? []
        : GEAR_RULES[slot].base;
}

/** 编辑草稿补空输入框，不替已有数值，也不把未填写项当作识别结果。 */
export function withGearBaseStats(detail: GearDetail, slot: GearSlotName): GearDetail {
    const fixed = fixedGearBaseLabels(slot);
    const choices = GEAR_RULES[slot].base.filter((label) => label !== '奇袭法术');
    const hasMain = detail.stats.some(
        (row) => gearStatGroup(row, slot) === 'base' && choices.includes(row.label),
    );
    const labels = fixed.length ? fixed : hasMain ? [] : choices.slice(0, 1);
    const required = slot.startsWith('玉魄') ? [...labels, '奇袭法术'] : labels;
    const missing = required.filter(
        (label) =>
            !detail.stats.some((row) => row.label === label && gearStatGroup(row, slot) === 'base'),
    );
    return missing.length
        ? {
              ...detail,
              stats: [
                  ...detail.stats,
                  ...missing.map((label): GearStat => ({ label, value: '', group: 'base' })),
              ],
          }
        : detail;
}

export function gearGroupOptions(slot: GearSlotName) {
    const jade = slot.startsWith('玉魄');
    return GEAR_STAT_GROUPS.filter((group) => gearStatOptions(slot, group.value).length).map(
        (group) => ({ ...group, label: jade && group.value === 'extra' ? '加成' : group.label }),
    );
}

export function gearConditionOptions(slot: GearSlotName) {
    const labels = slot.startsWith('玉魄')
        ? ['耐久度', '灵尘等级']
        : ['戒指', '耳饰', '配饰', '手镯'].includes(slot)
          ? ['耐久度', '修理失败', '精炼等级', '钟灵石']
          : ['耐久度', '修理失败', '锻炼等级', '镶嵌宝石', '开运孔数', '符石'];
    return labels.map((value) => ({ value, label: value }));
}

export function gearEffectOptions(slot: GearSlotName) {
    const labels = slot.startsWith('玉魄')
        ? [slot === '玉魄·阳' ? '奇袭特技' : '奇袭道具']
        : ['戒指', '耳饰', '配饰', '手镯'].includes(slot)
          ? ['特效', '套装']
          : ['特技', '特效', '套装'];
    return labels.map((value) => ({ value, label: value, kind: gearEffectKind(value) }));
}

function gearEffectKind(label: string): string {
    if (label === '特技') return 'active';
    if (label === '套装' || label === '套装效果') return 'suit';
    return label.startsWith('奇袭') ? 'ambush' : 'effect';
}

export function gearStatGroup(stat: GearStat, slot?: GearSlotName): GearStatGroup {
    if (stat.group) return stat.group;
    if (slot && ['武器', '衣服'].includes(slot) && FIVE_STATS.includes(stat.label)) return 'extra';
    if (
        slot &&
        !GEAR_RULES[slot].base.includes(stat.label) &&
        GEAR_RULES[slot].gem.includes(stat.label)
    )
        return 'gem';
    if (!stat.gain && !stat.extra) return 'base';
    if (!slot || slot.startsWith('玉魄') || ['戒指', '耳饰', '配饰', '手镯'].includes(slot)) {
        return 'extra';
    }
    return GEAR_RULES[slot].gem.includes(stat.label) ? 'gem' : 'extra';
}

export interface GearPropertyItem {
    source: 'stats' | 'cond' | 'lines';
    index: number;
    row: GearStat & { tone?: GearTone };
    /** 只控制展示；编辑始终绑定 row，不把缩写或单位写回数据。 */
    name: string;
    value: string;
}
export interface GearPropertyGroup {
    key: string;
    label: string;
    kind: string;
    tag: boolean;
    inline: boolean;
    items: GearPropertyItem[];
}

/** 共享分类布局；保留原数组下标和对象，编辑后保存不会丢失重复附加词条。 */
export function gearPropertyGroups(
    detail: GearDetail,
    slot?: GearSlotName,
    editable = false,
): GearPropertyGroup[] {
    const groups = new Map<string, GearPropertyGroup>();
    const jade = slot?.startsWith('玉魄') || /玉魄/.test(detail.kind);
    const spirit = slot
        ? ['戒指', '耳饰', '配饰', '手镯'].includes(slot)
        : /灵饰/.test(detail.kind);
    const add = (group: Omit<GearPropertyGroup, 'items'>, item: GearPropertyItem) => {
        if (!editable && !item.row.label.trim() && !item.row.value.trim()) return;
        const existing = groups.get(group.key);
        if (existing) existing.items.push(item);
        else groups.set(group.key, { ...group, items: [item] });
    };
    detail.stats.forEach((row, index) => {
        const ambush = jade && row.label.startsWith('奇袭');
        const kind = ambush ? 'ambush' : gearStatGroup(row, slot);
        add(
            {
                key: ambush ? 'ambush' : kind,
                label: ambush
                    ? '奇袭'
                    : kind === 'extra' && jade
                      ? '加成'
                      : GEAR_STAT_GROUPS.find((one) => one.value === kind)!.label,
                kind,
                tag: true,
                inline: !spirit && !jade,
            },
            {
                source: 'stats',
                index,
                row,
                name: ambush ? row.label.replace(/^奇袭/, '') : row.label,
                value: row.value,
            },
        );
    });
    detail.lines?.forEach((row, index) => {
        const kind = gearEffectKind(row.label);
        add(
            { key: `line-${index}`, label: row.label, kind, tag: true, inline: false },
            { source: 'lines', index, row, name: '', value: row.value },
        );
    });
    const cond = detail.cond ?? [];
    const socket = cond.some((row) => /精炼/.test(row.label))
        ? 'refine'
        : cond.some((row) => /锻炼/.test(row.label))
          ? 'forge'
          : 'socket';
    cond.forEach((row, index) => {
        let key = 'status';
        let label = '状态';
        let name = row.label;
        let value = row.value;
        let kind = 'status';
        let tag = false;
        if (/锻炼|精炼|宝石/.test(row.label)) {
            key = /锻炼/.test(row.label) ? 'forge' : /精炼/.test(row.label) ? 'refine' : socket;
            label = key === 'forge' ? '锻炼' : key === 'refine' ? '精炼' : '镶嵌';
            name = '';
            value = /锻炼|精炼/.test(row.label) && /^\d+$/.test(value) ? `${value} 段` : value;
            kind = 'upgrade';
            tag = true;
        } else if (/灵尘/.test(row.label)) {
            key = 'dust';
            label = '灵尘';
            name = '';
            value = /^\d+$/.test(value) ? `${value} 级` : value;
            kind = 'upgrade';
            tag = true;
        } else if (/钟灵石|符石|开运/.test(row.label)) {
            key = row.label;
            label = row.label;
            name = '';
            kind = 'upgrade';
        }
        add({ key, label, kind, tag, inline: true }, { source: 'cond', index, row, name, value });
    });
    const order = (key: string) => {
        if (['base', 'extra', 'gem', 'melt'].includes(key))
            return ['base', 'extra', 'gem', 'melt'].indexOf(key);
        if (key === 'status') return 9;
        if (
            key === 'ambush' ||
            (key.startsWith('line-') && groups.get(key)?.label.startsWith('奇袭'))
        )
            return 8;
        if (key.startsWith('line-')) return 4;
        return 6;
    };
    return [...groups.values()].sort((a, b) => order(a.key) - order(b.key));
}
