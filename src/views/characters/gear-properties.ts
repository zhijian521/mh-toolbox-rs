import {
    GEAR_JADE_EFFECTS,
    GEAR_TRAITS,
    type GearDetail,
    type GearSlotName,
    type GearStat,
    type GearStatGroup,
    type GearTone,
} from './gear';
import { GEAR_RULES } from '../../services/game-rules';

export const GEAR_STAT_GROUPS: { value: GearStatGroup; label: string }[] = [
    { value: 'base', label: '基础' },
    { value: 'extra', label: '附加' },
    { value: 'gem', label: '宝石' },
    { value: 'melt', label: '熔炼' },
    { value: 'trait', label: '160特性' },
];

export function gearStatOptions(slot: GearSlotName, group: GearStatGroup) {
    const rule = GEAR_RULES[slot];
    if (!rule) return [];
    if (group === 'trait') {
        const labels =
            rule.category === 'jade'
                ? GEAR_JADE_EFFECTS
                : rule.category === 'spirit'
                  ? []
                  : GEAR_TRAITS;
        return labels.map((value) => ({ value, label: value }));
    }
    if (group === 'melt' && rule.category !== 'equipment') return [];
    const labels = group === 'melt' ? [...rule.base, ...rule.extra] : rule[group];
    return [...new Set(labels)].map((value) => ({ value, label: value }));
}

/** 常规装备的基础词条固定；灵饰和玉魄主属性存在备选，只预置一项。 */
export function fixedGearBaseLabels(slot: GearSlotName): string[] {
    const rule = GEAR_RULES[slot];
    return rule?.category === 'equipment' ? rule.base : [];
}

/** 编辑草稿补空输入框，不替已有数值，也不把未填写项当作识别结果。 */
export function withGearBaseStats(detail: GearDetail, slot: GearSlotName): GearDetail {
    const fixed = fixedGearBaseLabels(slot);
    const choices = (GEAR_RULES[slot]?.base ?? []).filter((label) => label !== '奇袭法术');
    const hasMain = detail.stats.some(
        (row) => gearStatGroup(row, slot) === 'base' && choices.includes(row.label),
    );
    const labels = fixed.length ? fixed : hasMain ? [] : choices.slice(0, 1);
    const required = GEAR_RULES[slot]?.category === 'jade' ? [...labels, '奇袭法术'] : labels;
    const missing = required.filter(
        (label) =>
            !detail.stats.some(
                (row) =>
                    row.label === label &&
                    (label === '奇袭法术' || gearStatGroup(row, slot) === 'base'),
            ),
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
    const jade = GEAR_RULES[slot]?.category === 'jade';
    return GEAR_STAT_GROUPS.filter((group) => gearStatOptions(slot, group.value).length).map(
        (group) => ({
            ...group,
            label:
                jade && group.value === 'extra'
                    ? '加成'
                    : jade && group.value === 'trait'
                      ? '玉魄特效'
                      : group.label,
        }),
    );
}

export function gearConditionOptions(slot: GearSlotName) {
    const labels = GEAR_RULES[slot]?.conditions ?? [];
    return labels.map((value) => ({ value, label: value }));
}

export function gearEffectOptions(slot: GearSlotName) {
    const labels = GEAR_RULES[slot]?.effects ?? [];
    return labels.map((value) => ({ value, label: value, kind: gearEffectKind(value) }));
}

function gearEffectKind(label: string): string {
    if (label === '特技') return 'active';
    if (label === '套装' || label === '套装效果') return 'suit';
    if (label === '符石组合') return 'upgrade';
    return label.startsWith('奇袭') ? 'ambush' : 'effect';
}

export function gearStatGroup(stat: GearStat, slot?: GearSlotName): GearStatGroup {
    if (stat.group) return stat.group;
    const rule = slot ? GEAR_RULES[slot] : undefined;
    if (
        rule?.category === 'jade' &&
        stat.label !== '奇袭法术' &&
        GEAR_JADE_EFFECTS.some((label) => label === stat.label)
    )
        return 'trait';
    if (rule?.category === 'equipment' && GEAR_TRAITS.some((label) => label === stat.label))
        return 'trait';
    if (rule?.category === 'equipment' && rule.extra.includes(stat.label)) return 'extra';
    if (rule && !rule.base.includes(stat.label) && rule.gem.includes(stat.label)) return 'gem';
    if (!stat.gain && !stat.extra) return 'base';
    if (rule?.category !== 'equipment') {
        return 'extra';
    }
    return rule.gem.includes(stat.label) ? 'gem' : 'extra';
}

/** 奇袭法术与蓝字特效只记单值；灵饰 / 玉魄普通附加才展示强化输入。 */
export function gearStatHasExtra(stat: GearStat, slot: GearSlotName): boolean {
    if (
        gearStatGroup(stat, slot) === 'trait' ||
        GEAR_JADE_EFFECTS.some((label) => label === stat.label)
    )
        return false;
    return (
        stat.extra !== undefined ||
        (gearStatGroup(stat, slot) === 'extra' &&
            ['spirit', 'jade'].includes(GEAR_RULES[slot]?.category ?? ''))
    );
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
    const jade = slot ? GEAR_RULES[slot]?.category === 'jade' : /玉魄/.test(detail.kind);
    const spirit = slot ? GEAR_RULES[slot]?.category === 'spirit' : /灵饰/.test(detail.kind);
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
                      : kind === 'trait' && jade
                        ? '玉魄特效'
                        : GEAR_STAT_GROUPS.find((one) => one.value === kind)!.label,
                kind,
                tag: true,
                inline: !spirit && !jade && kind !== 'trait',
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
        if (['base', 'extra', 'trait', 'gem', 'melt'].includes(key))
            return ['base', 'extra', 'trait', 'gem', 'melt'].indexOf(key);
        if (key === 'status') return 9;
        if (
            key === 'ambush' ||
            (key.startsWith('line-') && groups.get(key)?.label.startsWith('奇袭'))
        )
            return 8;
        if (key.startsWith('line-')) return 5;
        return 6;
    };
    return [...groups.values()].sort((a, b) => order(a.key) - order(b.key));
}
