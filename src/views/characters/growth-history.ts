import type { CharacterData } from './character';
import { dateText, isDayText } from '../../services/format';
import { isObject, makeId, text } from '../../services/shape';

export interface GrowthChange {
    group: string;
    label: string;
    from: string;
    to: string;
}

export interface GrowthEntry {
    id: string;
    date: string;
    createdAt: number;
    source: 'edit' | 'goal' | 'legacy';
    note: string;
    changes: GrowthChange[];
}

export function normalizeGrowthHistory(raw: unknown): GrowthEntry[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    return raw.flatMap((entry) => {
        if (
            !isObject(entry) ||
            !text(entry.id) ||
            seen.has(text(entry.id)) ||
            !isDayText(text(entry.date)) ||
            !Array.isArray(entry.changes)
        )
            return [];
        const changes = entry.changes.flatMap((one): GrowthChange[] => {
            if (!isObject(one) || !text(one.label)) return [];
            const value = (raw: unknown) =>
                typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : text(raw);
            return [
                {
                    group: text(one.group),
                    label: text(one.label),
                    from: value(one.from),
                    to: value(one.to),
                },
            ];
        });
        if (!changes.length) return [];
        seen.add(text(entry.id));
        return [
            {
                id: text(entry.id),
                date: text(entry.date),
                createdAt:
                    typeof entry.createdAt === 'number' &&
                    Number.isSafeInteger(entry.createdAt) &&
                    entry.createdAt >= 0
                        ? entry.createdAt
                        : 0,
                source:
                    entry.source === 'goal'
                        ? ('goal' as const)
                        : entry.source === 'legacy'
                          ? ('legacy' as const)
                          : ('edit' as const),
                note: text(entry.note),
                changes,
            },
        ];
    });
}

function values(
    character: CharacterData,
): Map<string, { group: string; label: string; value: string }> {
    const result = new Map<string, { group: string; label: string; value: string }>();
    const add = (group: string, label: string, value: unknown) =>
        result.set(`${group}|${label}`, { group, label, value: String(value ?? '') });
    for (const [key, label] of [
        ['name', '名称'],
        ['level', '等级'],
        ['school', '门派'],
        ['server', '区服'],
        ['guild', '帮派'],
    ] as const)
        add('角色', label, character[key]);
    for (const group of character.attrGroups)
        for (const row of group.rows) add(group.title, row.label, row.value);
    for (const row of character.skills) add('师门', row.name, row.level);
    for (const row of character.assists)
        add(row.kind === 'story' ? '剧情技能' : '生活技能', row.name, row.level);
    for (const group of character.trainings)
        for (const row of group.rows) add(group.title, row.name, row.level);
    return result;
}

/** 记录只由保存入口生成；草稿里的历史不能覆盖已有记录。 */
export function withGrowthHistory(
    previous: CharacterData,
    next: CharacterData,
    source: GrowthEntry['source'] = 'edit',
    note = '',
    now = Date.now(),
): CharacterData {
    const before = values(previous),
        after = values(next);
    const changes: GrowthChange[] = [];
    for (const key of new Set([...before.keys(), ...after.keys()])) {
        const from = before.get(key),
            to = after.get(key);
        if ((from?.value ?? '') === (to?.value ?? '')) continue;
        const row = to ?? from!;
        changes.push({
            group: row.group,
            label: row.label,
            from: from?.value ?? '',
            to: to?.value ?? '',
        });
    }
    const history = previous.growthHistory ?? [];
    if (!changes.length) return { ...next, growthHistory: history.length ? history : undefined };
    return {
        ...next,
        growthHistory: [
            ...history,
            { id: makeId('growth'), date: dateText(now), createdAt: now, source, note, changes },
        ],
    };
}
