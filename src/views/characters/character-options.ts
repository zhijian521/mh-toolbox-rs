import { ALL_OPTIONS } from '../../components/select-options';

export const UNASSIGNED_CHARACTER = '__none__';

/** 历史归属保留已删角色；全部、未指定和真实角色各用独立值。 */
export function characterOptions(
    roster: readonly { id: string; name: string }[],
    historicalIds: readonly string[] = [],
    include: { all?: boolean; unassigned?: string } = {},
) {
    const options = roster.map((one) => ({ value: one.id, label: one.name }));
    const alive = new Set(roster.map((one) => one.id));
    const removed = [...new Set(historicalIds.filter((id) => id && !alive.has(id)))].sort();
    return [
        ...(include.all ? [{ value: ALL_OPTIONS, label: '全部角色' }] : []),
        ...(include.unassigned ? [{ value: UNASSIGNED_CHARACTER, label: include.unassigned }] : []),
        ...options,
        ...removed.map((id, index) => ({
            value: id,
            label: removed.length > 1 ? '已删角色 ' + (index + 1) : '已删角色',
        })),
    ];
}
