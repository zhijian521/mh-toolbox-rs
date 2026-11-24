import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AlarmDraft } from './alarms';

const draft: AlarmDraft = {
    time: '08:30',
    label: '捉鬼',
    repeat: 'daily',
    weekdays: [],
    date: '',
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

async function setup(raw: string | null = null) {
    vi.resetModules();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const storage = {
        getItem: vi.fn(() => raw),
        setItem: vi.fn((_key: string, _value: string) => {}),
    };
    vi.stubGlobal('localStorage', storage);
    const { useAlarms } = await import('./alarm-store');
    return { store: useAlarms(), storage };
}

describe('闹钟保存回执', () => {
    it('读取失败时保护原数据，重读成功后才恢复写入', async () => {
        const { store, storage } = await setup('{');
        expect(store.loadError.value).not.toBe('');
        expect(store.add(draft).ok).toBe(false);
        expect(storage.setItem).not.toHaveBeenCalled();
        storage.getItem.mockReturnValue('[]');
        await store.retryLoad();
        expect(store.loadError.value).toBe('');
        expect(store.add(draft).ok).toBe(true);
    });

    it('活动同一场次复用记录，改备注后仍关联，停用后可重新开启并重载', async () => {
        const { store, storage } = await setup();
        await import('../../services/game-data.fixture');
        const activity: AlarmDraft = {
            time: '22:00',
            label: '小龟快跑',
            repeat: 'activity',
            activityId: 'turtle',
            weekdays: [],
            date: '',
        };
        expect(store.add({ ...draft, label: '小龟快跑' }).ok).toBe(true);
        expect(store.add(activity).ok).toBe(true);
        const linked = store.alarms.value.find((one) => one.repeat === 'activity')!;
        store.markFired(linked.id, '2026-11-16 22:00');
        expect(store.update(linked.id, { ...activity, label: '晚上的比赛' }).ok).toBe(true);
        expect(store.setEnabled(linked.id, false).ok).toBe(true);
        expect(store.add(activity).ok).toBe(true);
        expect(store.alarms.value).toHaveLength(2);
        const saved = storage.setItem.mock.calls.at(-1)!;
        const reloaded = await setup(saved[1]);
        const result = reloaded.store.alarms.value.find((one) => one.id === linked.id)!;
        expect(result.activityId).toBe('turtle');
        expect(result.enabled).toBe(true);
        expect(result.label).toBe('晚上的比赛');
        expect(result.fired).toBe('2026-11-16 22:00');
    });

    it('不同场次可以独立提醒，修改不允许合并到已存在的场次', async () => {
        const { store } = await setup();
        await import('../../services/game-data.fixture');
        const first: AlarmDraft = {
            ...draft,
            time: '12:00',
            repeat: 'activity',
            activityId: 'turtle',
        };
        expect(store.add(first).ok).toBe(true);
        expect(store.add({ ...first, time: '22:00' }).ok).toBe(true);
        const second = store.alarms.value.find((one) => one.time === '22:00')!;
        expect(store.update(second.id, first).ok).toBe(false);
        expect(store.alarms.value.map((one) => one.time)).toEqual(['12:00', '22:00']);
    });

    it('新增失败保留原清单，重试只添加一条且重载仍在', async () => {
        const { store, storage } = await setup();
        storage.setItem.mockImplementationOnce(() => {
            throw new Error('quota');
        });
        expect(store.add(draft).ok).toBe(false);
        expect(store.alarms.value).toHaveLength(0);
        expect(store.add(draft).ok).toBe(true);
        expect(store.alarms.value).toHaveLength(1);
        const saved = storage.setItem.mock.calls.at(-1)!;
        const reloaded = await setup(saved[1]);
        expect(reloaded.store.alarms.value).toHaveLength(1);
        expect(reloaded.store.alarms.value[0].label).toBe('捉鬼');
    });

    it('修改、删除、启停失败均不改变已保存状态', async () => {
        const { store, storage } = await setup();
        expect(store.add(draft).ok).toBe(true);
        const before = JSON.stringify(store.alarms.value);
        const id = store.alarms.value[0].id;
        storage.setItem.mockImplementation(() => {
            throw new Error('quota');
        });
        expect(store.update(id, { ...draft, label: '摆摊' }).ok).toBe(false);
        expect(store.remove(id).ok).toBe(false);
        expect(store.setEnabled(id, false).ok).toBe(false);
        expect(JSON.stringify(store.alarms.value)).toBe(before);
    });

    it('坏存档暂停写入；提醒标记失败也不会在本次运行反复提醒', async () => {
        const broken = await setup('{broken');
        expect(broken.store.add(draft).ok).toBe(false);
        expect(broken.storage.setItem).not.toHaveBeenCalled();
        const { store, storage } = await setup();
        store.add(draft);
        storage.setItem.mockImplementation(() => {
            throw new Error('quota');
        });
        store.markFired(store.alarms.value[0].id, '2026-11-14 08:30');
        expect(store.alarms.value[0].fired).toBe('2026-11-14 08:30');
        expect(store.error.value).not.toBe('');
    });
});
