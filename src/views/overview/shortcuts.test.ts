import { describe, expect, it } from 'vitest';
import { TOOLS } from '../../tools';
import {
    DEFAULT_SHORTCUT_IDS,
    HOME_SHORTCUTS,
    moveShortcut,
    normalizeShortcutIds,
    shortcutsByIds,
} from './shortcuts';

describe('首页常用功能配置', () => {
    it('缺失配置恢复独立的默认列表，明确清空则保持为空', () => {
        for (const raw of [undefined, null, {}, 'account-new']) {
            const result = normalizeShortcutIds(raw);
            expect(result).toEqual(DEFAULT_SHORTCUT_IDS);
            expect(result).not.toBe(DEFAULT_SHORTCUT_IDS);
        }
        expect(normalizeShortcutIds([])).toEqual([]);
    });

    it('过滤失效、重复与非法入口，保留用户顺序且不改输入', () => {
        const raw = ['settings', 'obsolete', 'account-new', 'settings', null, 1];
        expect(normalizeShortcutIds(raw)).toEqual(['settings', 'account-new']);
        expect(raw).toEqual(['settings', 'obsolete', 'account-new', 'settings', null, 1]);
        expect(
            shortcutsByIds(['settings', 'obsolete', 'account-new']).map((one) => one.id),
        ).toEqual(['settings', 'account-new']);
    });

    it('支持前移、后移与拖动目标，其他入口的相对顺序不变', () => {
        const ids = ['a', 'b', 'c', 'd'];
        expect(moveShortcut(ids, 'c', 0)).toEqual(['c', 'a', 'b', 'd']);
        expect(moveShortcut(ids, 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
        expect(moveShortcut(ids, 'b', -10)).toEqual(['b', 'a', 'c', 'd']);
        expect(moveShortcut(ids, 'b', 10)).toEqual(['a', 'c', 'd', 'b']);
        expect(moveShortcut(ids, 'missing', 0)).toEqual(ids);
        expect(moveShortcut(ids, 'a', NaN)).toEqual(ids);
        expect(moveShortcut(ids, 'a', 0.5)).toEqual(ids);
        expect(ids).toEqual(['a', 'b', 'c', 'd']);
    });

    it('目录不重名，默认项有效，所有已实现工具都可添加', () => {
        expect(new Set(HOME_SHORTCUTS.map((one) => one.id)).size).toBe(HOME_SHORTCUTS.length);
        expect(normalizeShortcutIds(DEFAULT_SHORTCUT_IDS)).toEqual(DEFAULT_SHORTCUT_IDS);
        for (const tool of TOOLS.filter((one) => one.ready)) {
            const shortcut = HOME_SHORTCUTS.find((one) => one.id === 'tool-' + tool.key);
            expect(shortcut).toMatchObject(
                tool.kind === 'page' ? { path: tool.path } : { href: tool.href },
            );
        }
        expect(HOME_SHORTCUTS.filter((one) => one.pane).map((one) => one.pane)).toEqual([
            'attrs',
            'skills',
            'assist',
            'training',
            'gear',
            'pets',
        ]);
        expect(HOME_SHORTCUTS.find((one) => one.id === 'alarm-new')).toMatchObject({
            path: '/tools/alarm',
            action: 'new',
        });
    });
});
