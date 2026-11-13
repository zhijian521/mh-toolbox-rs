/** 历史归属保留已删角色，避免旧记录在编辑器中显示成“未选”。 */
export function characterOptions(
    roster: readonly { id: string; name: string }[],
    historicalIds: readonly string[] = [],
) {
    const options = roster.map((one) => ({ value: one.id, label: one.name }));
    const alive = new Set(roster.map((one) => one.id));
    const removed = [...new Set(historicalIds.filter((id) => id && !alive.has(id)))].sort();
    return [
        ...options,
        ...removed.map((id, index) => ({
            value: id,
            label: removed.length > 1 ? '已删角色 ' + (index + 1) : '已删角色',
        })),
    ];
}
