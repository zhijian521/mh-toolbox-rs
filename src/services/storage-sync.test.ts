import { afterEach, describe, expect, it, vi } from 'vitest';
import { onStorageSync } from './storage-sync';

/**
 * 跨窗口同步的**过滤条件**。
 *
 * 这段逻辑原先在收益账与物价表里各写一遍，逐字相同，其中只有一份写了完整理由。
 * 抽出来之后它成了两条链的共同入口——判错一次，两个页面的「另一端改了」都会失灵，
 * 而失灵的表现是「另一窗删了，这一边还显示着」，不会报错。
 *
 * 三条分支各自对应一件具体的事：
 *   - `key === null`  → 有人调了 `clear()`，整份存储没了，要读成空；
 *   - `key` 是别人的 → 主题 / 字号变了，与本份数据无关，**不该**重读；
 *   - `key` 是自己的 → 正常的一次写入，照着 `newValue` 应用。
 */

type Handler = (event: { key: string | null; newValue: string | null }) => void;

/** 装一个只做 `addEventListener` 的假 window，返回它能收到的处理器。 */
function stubWindow(): Handler[] {
    const handlers: Handler[] = [];
    vi.stubGlobal('window', {
        addEventListener: (_type: string, handler: Handler) => handlers.push(handler),
    });
    return handlers;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('onStorageSync：什么时候该重读', () => {
    it('没有 window（Node / 测试环境）时安静返回，不抛错', () => {
        const apply = vi.fn();
        expect(() => onStorageSync('mh-income', apply)).not.toThrow();
        expect(apply).not.toHaveBeenCalled();
    });

    it('把处理器挂在 storage 事件上，且只挂一次', () => {
        const handlers = stubWindow();
        onStorageSync('mh-income', vi.fn());
        expect(handlers).toHaveLength(1);
    });

    it('自己的键：把 newValue 原样交出去', () => {
        const handlers = stubWindow();
        const apply = vi.fn();
        onStorageSync('mh-income', apply);

        handlers[0]({ key: 'mh-income', newValue: '{"entries":[]}' });
        expect(apply).toHaveBeenCalledWith('{"entries":[]}');
    });

    it('别人的键（主题、字号）：一次都不重读', () => {
        /* 少了这条判断，改一次主题会让两份数据各重读一遍——不报错，只是白读。
         * 真正会出事的是下一条。 */
        const handlers = stubWindow();
        const apply = vi.fn();
        onStorageSync('mh-income', apply);

        handlers[0]({ key: 'mh-theme', newValue: 'dark' });
        handlers[0]({ key: 'mh-font-scale', newValue: '1.1' });
        expect(apply).not.toHaveBeenCalled();
    });

    it('key 为 null（clear）：照样交出去，值也是 null', () => {
        /* 这是最容易漏的一条：`clear()` 之后所有键一起没，事件里的 `key` 是 `null`。
         * 按「只认自己的键」写就会把它当成无关事件跳过，于是另一窗清了数据，
         * 这一边还满着——用户以为没清掉，再点一次清除。 */
        const handlers = stubWindow();
        const apply = vi.fn();
        onStorageSync('mh-income', apply);

        handlers[0]({ key: null, newValue: null });
        expect(apply).toHaveBeenCalledWith(null);
    });

    it('同一个键被 removeItem：交出去的是 null，不是空串', () => {
        /* `null` 与 `''` 在调用方是两件事：前者「确实该空」，后者「解析失败、保持现状」。 */
        const handlers = stubWindow();
        const apply = vi.fn();
        onStorageSync('mh-prices', apply);

        handlers[0]({ key: 'mh-prices', newValue: null });
        expect(apply).toHaveBeenCalledWith(null);
        expect(apply).not.toHaveBeenCalledWith('');
    });
});
