import { describe, expect, it, vi, afterEach } from 'vitest';
import { checkUpdate, releaseResult } from './updates';

const release = (tag: string) => ({
    tag_name: tag,
    draft: false,
    prerelease: false,
    html_url: `https://github.com/zhijian521/mh-toolbox-rs/releases/tag/${tag}`,
});
afterEach(() => vi.unstubAllGlobals());

describe('正式版本检查', () => {
    it('按数字段比较版本，忽略草稿和预发布', () => {
        expect(releaseResult(release('v0.10.0'), '0.9.9').status).toBe('available');
        expect(releaseResult(release('v0.1.0'), '0.1.0').status).toBe('current');
        expect(releaseResult(release('v0.1.0'), '0.2.0').status).toBe('current');
        expect(releaseResult(release('v0.1.0'), '0.1.0-beta.1').status).toBe('available');
        expect(releaseResult({ ...release('v0.2.0'), prerelease: true }, '0.1.0').status).toBe(
            'none',
        );
        expect(releaseResult({ ...release('v0.2.0'), draft: true }, '0.1.0').status).toBe('none');
        expect(releaseResult(release('v0.2.0-beta.1'), '0.1.0').status).toBe('none');
    });
    it('拒绝无法比较的版本号和其他项目的下载地址', () => {
        expect(() => releaseResult(release('latest'), '0.1.0')).toThrow('版本号');
        expect(() =>
            releaseResult(
                { ...release('v1.0.0'), html_url: 'https://example.com/download' },
                '0.1.0',
            ),
        ).toThrow('不属于');
    });
    it('尚无正式 Release 与网络失败分开处理', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404 }));
        expect(await checkUpdate('0.1.0')).toEqual({ status: 'none' });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 429 }));
        await expect(checkUpdate('0.1.0')).rejects.toThrow('受限');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        await expect(checkUpdate('0.1.0')).rejects.toThrow('无法连接');
    });
});
