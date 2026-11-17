import { describe, expect, it, vi } from 'vitest';
import type { GoalInput } from './goals-store';

/**
 * `goals-store.ts` 的**读失败闸门**。
 *
 * 目标与其它业务数据层共用加载和写队列（`services/persist.ts`）。它比别的账多一层风险：
 * 一个目标身上挂着流水，整份覆盖丢的不只是「许了什么」，还有已经攒下的进度。
 *
 * 同时覆盖多角色快照、写入校验与已记进度的保护。
 */

function host(load: () => Promise<unknown>) {
    return {
        hasDesktop: () => true,
        goalLoad: vi.fn(load),
        goalSave: vi.fn(async () => true),
    };
}

async function loadStore(desktop: ReturnType<typeof host>) {
    vi.resetModules();
    vi.doMock('../../services/desktop', () => desktop);
    vi.doMock('../../services/storage', () => desktop);
    const store = await import('./goals-store');
    await store.loadGoals();
    return store;
}

/** 排队的写入落在微任务里，让出一个宏任务再断言。 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** 手动目标：只要一个成员、一个正数目标、一个单位就能过 `check()`。 */
const GOAL: GoalInput = {
    kind: 'money',
    title: '',
    members: [{ id: 'c1', name: '归ω岚' }],
    target: 100,
    unit: '万',
    tracking: null,
    deadline: '',
    note: '',
};

describe('组合目标独立存档', () => {
    it('读取时恢复误存为组合的普通养成，不自动改写账本', async () => {
        const raw = {
            ...GOAL,
            id: 'old-growth',
            kind: 'combo',
            title: '归ω岚 · 角色等级 到 120级',
            target: 0,
            unit: '项',
            items: [
                {
                    characterId: 'c1',
                    tracking: { category: 'level', key: '角色等级' },
                    target: 120,
                },
            ],
            logs: [],
            createdAt: 1,
        };
        const before = JSON.stringify(raw);
        const desktop = host(async () => [raw]);
        const store = await loadStore(desktop);
        const loaded = store.useGoals().goals.value;
        expect(loaded).toHaveLength(1);
        expect(loaded[0]).toMatchObject({
            id: raw.id,
            kind: 'growth',
            target: 120,
            unit: '级',
            tracking: { category: 'level', key: '角色等级' },
        });
        expect(loaded[0]).not.toHaveProperty('items');
        await store.useGoals().flush();
        expect(desktop.goalSave).not.toHaveBeenCalled();
        expect(JSON.stringify(raw)).toBe(before);
    });

    it('保存逐角色项目、深拷贝草稿，拒绝手记流水和不完整项目', async () => {
        const store = await loadStore(host(async () => []));
        const input: GoalInput = {
            ...GOAL,
            kind: 'combo',
            target: 0,
            unit: '项',
            items: [
                {
                    characterId: 'c1',
                    tracking: { category: 'level', key: '角色等级' },
                    target: 130,
                },
                { characterId: 'c1', tracking: { category: 'assist', key: '强身术' }, target: 120 },
            ],
        };
        const result = store.addGoal(input);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        input.items![0].target = 175;
        expect(result.goal.items?.[0].target).toBe(130);
        expect(result.goal.tracking).toBeNull();
        expect(result.goal.comboVersion).toBe(1);
        expect(store.addLog(result.goal.id, { date: '2026-11-17', delta: 1, note: '' }).ok).toBe(
            false,
        );
        expect(store.addGoal({ ...input, items: [] }).ok).toBe(false);
        expect(store.addGoal({ ...input, items: [...input.items!, input.items![0]] }).ok).toBe(
            false,
        );
        const renamed = store.updateGoal(result.goal.id, { ...input, title: '组合新标题' });
        expect(renamed.ok && renamed.goal.createdAt).toBe(result.goal.createdAt);
        expect(
            store.updateGoal(result.goal.id, {
                ...GOAL,
                kind: 'growth',
                tracking: { category: 'level', key: '角色等级' },
            }).ok,
        ).toBe(false);
        await store.useGoals().flush();
    });
});

describe('loadGoals：读失败不等于空表', () => {
    it('goalLoad 返回 null：立错误位、目标清空、一次都不写', async () => {
        const desktop = host(async () => null);
        const store = await loadStore(desktop);
        const { goals, loadError } = store.useGoals();

        expect(goals.value).toEqual([]);
        expect(loadError.value).not.toBe('');
        expect(desktop.goalSave).not.toHaveBeenCalled();
    });

    it('读失败时新建目标被拒（返回原因，不是静默失败）', async () => {
        const desktop = host(async () => null);
        const store = await loadStore(desktop);
        const { addGoal, goals } = store.useGoals();

        const write = addGoal(GOAL);
        expect(write.ok).toBe(false);
        /* 原因要指得着「读取失败」这件事，而不是「没选角色」这种无关的校验错。 */
        if (!write.ok) expect(write.error).toContain('读取失败');
        expect(goals.value).toEqual([]);
        await flush();
        expect(desktop.goalSave).not.toHaveBeenCalled();
    });

    it('下一轮读到数据时闸要放开——写入恢复', async () => {
        const desktop = host(async () => []);
        const store = await loadStore(desktop);
        const { addGoal, loadError } = store.useGoals();

        expect(loadError.value).toBe('');
        expect(addGoal(GOAL).ok).toBe(true);
        await flush();
        expect(desktop.goalSave).toHaveBeenCalledTimes(1);
    });
});

describe('目标写入：多人养成与记录保护', () => {
    it('不存在的截止日期拒绝新增和修改，保留原目标', async () => {
        const store = await loadStore(host(async () => []));
        expect(store.addGoal({ ...GOAL, deadline: '2026-02-29' }).ok).toBe(false);
        const created = store.addGoal({ ...GOAL, deadline: '2028-02-29' });
        expect(created.ok).toBe(true);
        if (!created.ok) return;
        expect(store.updateGoal(created.goal.id, { ...GOAL, deadline: '2026-04-31' }).ok).toBe(
            false,
        );
        expect(store.useGoals().goals.value[0].deadline).toBe('2028-02-29');
    });

    it('新增保存成员顺序、去重，并复制成员快照', async () => {
        const store = await loadStore(host(async () => []));
        const members = [
            { id: 'c', name: '丙' },
            { id: 'a', name: '甲' },
            { id: 'c', name: '重复' },
        ];
        const result = store.addGoal({ ...GOAL, members });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        members[0].name = '改名';
        expect(result.goal.members).toEqual([
            { id: 'c', name: '丙' },
            { id: 'a', name: '甲' },
        ]);
        expect(store.addGoal({ ...GOAL, members: [] }).ok).toBe(false);
    });

    it('养成单位由项目决定，非法等级不写入', async () => {
        const store = await loadStore(host(async () => []));
        const input: GoalInput = {
            ...GOAL,
            kind: 'growth',
            tracking: { category: 'attr', key: '潜能果' },
            target: 100,
            unit: '级',
        };
        const result = store.addGoal(input);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.goal.unit).toBe('个');
        expect(store.addGoal({ ...input, target: 1.5 }).ok).toBe(false);
        expect(store.addGoal({ ...input, tracking: null }).ok).toBe(false);
        expect(store.addGoal({ ...input, members: [{ id: '', name: '甲' }] }).ok).toBe(false);
        await flush();
    });

    it('手动养成名称可留空自动生成，并支持小数累计、减少与删除记录', async () => {
        const store = await loadStore(host(async () => []));
        const automatic = store.addGoal({ ...GOAL, kind: 'manual', title: '  ' });
        expect(automatic.ok).toBe(true);
        if (automatic.ok) {
            expect(automatic.goal.title).toBe('归ω岚 · 累计 100 万');
            const renamed = store.updateGoal(automatic.goal.id, {
                ...GOAL,
                kind: 'manual',
                title: '  自定计划  ',
            });
            expect(renamed.ok && renamed.goal.title).toBe('自定计划');
            const cleared = store.updateGoal(automatic.goal.id, { ...GOAL, kind: 'manual' });
            expect(cleared.ok && cleared.goal.title).toBe(automatic.goal.title);
        }
        const result = store.addGoal({
            ...GOAL,
            kind: 'manual',
            title: '坐骑成长',
            target: 2.3,
            unit: '点',
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(store.addLog(result.goal.id, { date: '2026-11-13', delta: 1.3, note: '' }).ok).toBe(
            true,
        );
        const reduced = store.addLog(result.goal.id, { date: '2026-11-13', delta: -2, note: '' });
        expect(reduced.ok).toBe(true);
        if (reduced.ok) {
            expect(reduced.goal.logs[1].delta).toBe(-1.3);
            store.removeLog(result.goal.id, reduced.goal.logs[1].id);
        }
        expect(store.useGoals().goals.value[0].logs).toHaveLength(1);
        await flush();
    });

    it('已有目标不能切换类型，已有记录不能切单位，标题修改保留进度', async () => {
        const store = await loadStore(host(async () => []));
        const result = store.addGoal(GOAL);
        if (!result.ok) throw new Error(result.error);
        store.addLog(result.goal.id, { date: '2026-11-13', delta: 10, note: '' });
        expect(store.updateGoal(result.goal.id, { ...GOAL, kind: 'gear', unit: '件' }).ok).toBe(
            false,
        );
        expect(store.updateGoal(result.goal.id, { ...GOAL, unit: '元' }).ok).toBe(false);
        const renamed = store.updateGoal(result.goal.id, { ...GOAL, title: '新标题' });
        expect(renamed.ok).toBe(true);
        if (renamed.ok) {
            expect(renamed.goal.logs).toHaveLength(1);
            expect(renamed.goal.createdAt).toBe(result.goal.createdAt);
        }
        const gear = store.addGoal({ ...GOAL, kind: 'gear', target: 3, unit: '件' });
        if (!gear.ok) throw new Error(gear.error);
        expect(store.addLog(gear.goal.id, { date: '2026-11-13', delta: 0.5, note: '' }).ok).toBe(
            false,
        );
        await flush();
    });
});
