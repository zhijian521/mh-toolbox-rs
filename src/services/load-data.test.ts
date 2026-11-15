import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { loadData } from './load-data';
import { createPersist } from './persist';

const desktop = vi.hoisted(() => ({ enabled: true }));
vi.mock('./desktop', () => ({ hasDesktop: () => desktop.enabled }));

beforeEach(() => {
    desktop.enabled = true;
});

function setup() {
    const loaded = ref(true);
    const loadError = ref('');
    const value = ref(['原数据']);
    const options = {
        loaded,
        loadError,
        error: '读取失败，暂停写入',
        readLocal: vi.fn(() => ({ ok: true as const, value: ['本地数据'] })),
        readRemote: vi.fn<() => Promise<string[] | null>>(async () => ['桌面数据']),
        applyLocal: (stored: string[] | null) => {
            value.value = stored ?? [];
        },
        applyRemote: (stored: string[]) => {
            value.value = stored;
        },
    };
    return { options, value };
}

describe('业务加载边界', () => {
    it('读取未完成时禁止写入，完整应用后才开放', async () => {
        const { options, value } = setup();
        let finish!: (stored: string[]) => void;
        options.readRemote.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
        const writeRemote = vi.fn(async () => true);
        const persist = createPersist({
            label: '加载边界',
            loaded: options.loaded,
            loadError: options.loadError,
            writeError: ref(''),
            writeLocal: vi.fn(),
            writeRemote,
        });
        const loading = loadData(options);
        expect(await persist()).toBe(false);
        expect(writeRemote).not.toHaveBeenCalled();
        finish(['新数据']);
        await loading;
        expect(value.value).toEqual(['新数据']);
        expect(await persist()).toBe(true);
    });

    it('桌面空表是成功结果，不回落本地或种子', async () => {
        const { options, value } = setup();
        options.readRemote.mockResolvedValue([]);
        await loadData(options);
        expect(value.value).toEqual([]);
        expect(options.loaded.value).toBe(true);
        expect(options.readLocal).not.toHaveBeenCalled();
    });

    it('重读失败保留原数据并关闸，成功重试清除错误', async () => {
        const { options, value } = setup();
        options.readRemote.mockResolvedValueOnce(null);
        await loadData(options);
        expect(value.value).toEqual(['原数据']);
        expect(options.loaded.value).toBe(false);
        expect(options.loadError.value).toBe(options.error);
        await loadData(options);
        expect(value.value).toEqual(['桌面数据']);
        expect(options.loaded.value).toBe(true);
        expect(options.loadError.value).toBe('');
    });

    it('浏览器未保存由领域提供默认值，损坏存档不当作空表', async () => {
        desktop.enabled = false;
        const { options, value } = setup();
        await loadData({ ...options, readLocal: () => ({ ok: true, value: null }) });
        expect(value.value).toEqual([]);
        await loadData({
            ...options,
            readLocal: () => ({ ok: false, error: '存档损坏' }),
        });
        expect(options.loadError.value).toBe('存档损坏');
        expect(options.loaded.value).toBe(false);
        expect(options.readRemote).not.toHaveBeenCalled();
    });

    it('异步默认数据应用结束前保持不可写', async () => {
        desktop.enabled = false;
        const { options } = setup();
        let finish!: () => void;
        const loading = loadData({
            ...options,
            applyLocal: () => new Promise<void>((resolve) => (finish = resolve)),
        });
        expect(options.loaded.value).toBe(false);
        finish();
        await loading;
        expect(options.loaded.value).toBe(true);
    });

    it.each(['read', 'parse'])('读取或解析抛错也不开放写入：%s', async (stage) => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { options, value } = setup();
        const fail = () => {
            throw new Error('损坏');
        };
        await loadData({
            ...options,
            ...(stage === 'read' ? { readRemote: async () => fail() } : { applyRemote: fail }),
        });
        expect(value.value).toEqual(['原数据']);
        expect(options.loaded.value).toBe(false);
        expect(options.loadError.value).toBe(options.error);
    });
});
