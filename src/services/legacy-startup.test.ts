import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importLegacyOnStartup } from './legacy-startup';

const mocks = vi.hoisted(() => ({
    desktop: vi.fn(),
    read: vi.fn(),
    rules: vi.fn(),
    convert: vi.fn(),
    import: vi.fn(),
}));
vi.mock('./bindings', () => ({ commands: { legacyStartupRead: mocks.read } }));
vi.mock('./desktop', () => ({ hasDesktop: mocks.desktop }));
vi.mock('./data-files', () => ({ legacyDataImport: mocks.import }));
vi.mock('./game-data', () => ({ loadGameData: mocks.rules }));
vi.mock('../import/legacy', () => ({ convertLegacyData: mocks.convert }));

beforeEach(() => {
    vi.resetAllMocks();
    mocks.desktop.mockReturnValue(true);
    mocks.read.mockResolvedValue(null);
    mocks.rules.mockResolvedValue(undefined);
    mocks.convert.mockReturnValue({ backup: { characters: [{ id: 'c1' }] }, warnings: [] });
    mocks.import.mockResolvedValue({ status: 'ok', detail: '已导入' });
});

describe('首次旧版导入', () => {
    it('浏览器不触发检测；已有新版数据、已检测或无旧文件时不转换和导入', async () => {
        mocks.desktop.mockReturnValue(false);
        expect(await importLegacyOnStartup()).toBeUndefined();
        expect(mocks.read).not.toHaveBeenCalled();
        mocks.desktop.mockReturnValue(true);
        expect(await importLegacyOnStartup()).toBeUndefined();
        expect(mocks.rules).not.toHaveBeenCalled();
        expect(mocks.convert).not.toHaveBeenCalled();
        expect(mocks.import).not.toHaveBeenCalled();
    });

    it('规则加载后复用旧版转换和导入方法，并带上差异提示', async () => {
        mocks.read.mockResolvedValue('旧版原文');
        mocks.convert.mockReturnValue({ backup: { characters: [] }, warnings: ['部分目标需调整'] });
        mocks.import.mockResolvedValue({
            status: 'ok',
            detail: '已导入',
            truncation: { points: 5, items: 1 },
        });
        const notice = await importLegacyOnStartup();
        expect(mocks.rules.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.convert.mock.invocationCallOrder[0],
        );
        expect(mocks.convert).toHaveBeenCalledWith('旧版原文');
        expect(mocks.import).toHaveBeenCalledWith('旧版原文', '{"characters":[]}', true);
        expect(notice?.title).toBe('已导入旧版本数据，可以直接使用');
        expect(notice?.note).toContain('部分目标需调整');
        expect(notice?.note).toContain('5 条');
    });

    it.each(['读取', '转换', '导入'])('%s失败说明原因及手动入口，不误报成功', async (stage) => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        mocks.read.mockResolvedValue('旧版原文');
        if (stage === '读取') mocks.read.mockRejectedValue(new Error('读取失败'));
        if (stage === '转换') {
            mocks.convert.mockImplementation(() => {
                throw new Error('转换失败');
            });
        }
        if (stage === '导入') {
            mocks.import.mockResolvedValue({ status: 'failed', error: '导入失败' });
        }
        try {
            const notice = await importLegacyOnStartup();
            expect(notice?.title).toBe('旧版本数据未能自动导入');
            expect(notice?.note).toContain(`${stage}失败`);
            expect(notice?.note).toContain('设置 → 数据 → 导入旧版');
            if (stage !== '导入') expect(mocks.import).not.toHaveBeenCalled();
        } finally {
            log.mockRestore();
        }
    });
});
