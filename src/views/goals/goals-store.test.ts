import { describe, expect, it, vi } from 'vitest';
import type { GoalInput } from './goals-store';

/**
 * `goals-store.ts` 的**读失败闸门**。
 *
 * 目标与其它四本账同一个骨架（`services/persist.ts`）。它比别的账多一层风险：
 * 一个目标身上挂着流水，整份覆盖丢的不只是「许了什么」，还有已经攒下的进度。
 *
 * 这里只钉闸门本身；`check()` 那套校验（成员 / 单位 / 整数）属于 `goals.ts` 的
 * 纯逻辑，已经有 20 多条用例着（`goals.test.ts`），不在这里重复。
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
