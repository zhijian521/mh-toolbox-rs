import { beforeEach, expect, it, vi } from 'vitest';
import { importLegacyLedger } from './import-legacy-ledger';

const mocks = vi.hoisted(() => ({
    read: vi.fn(),
    prepare: vi.fn(),
    confirm: vi.fn(),
    save: vi.fn(),
}));
vi.mock('../../services/data-files', () => ({
    legacyDataRead: mocks.read,
    legacyDataImport: mocks.save,
}));
vi.mock('../../services/legacy-startup', () => ({ prepareLegacyData: mocks.prepare }));
vi.mock('../../composables/use-confirm', () => ({ askConfirm: mocks.confirm }));
const backup = { characters: [], prices: [{}], income: [], accounts: [], online: [], goals: [] };

beforeEach(() => {
    vi.resetAllMocks();
    mocks.read.mockResolvedValue({ status: 'ok', raw: '旧账原件' });
    mocks.prepare.mockResolvedValue({ backup, warnings: ['需核对分类'] });
});

it('在确认前预览差异，取消替换不会写账本', async () => {
    mocks.confirm.mockResolvedValue(false);
    expect(await importLegacyLedger()).toEqual({ status: 'canceled' });
    expect(mocks.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
            title: '用旧版数据替换当前账本？',
            confirmText: '替换并导入',
            note: expect.stringContaining('需核对分类'),
        }),
    );
    expect(mocks.save).not.toHaveBeenCalled();
});

it('确认后只提交预览过的旧账，保留备份回执和差异', async () => {
    mocks.confirm.mockResolvedValue(true);
    mocks.save.mockResolvedValue({ status: 'ok', detail: '备份位置' });
    expect(await importLegacyLedger()).toEqual({
        status: 'ok',
        detail: '备份位置',
        warning: '需核对分类',
    });
    expect(mocks.save).toHaveBeenCalledWith('旧账原件', JSON.stringify(backup));
});
