import { afterEach, describe, expect, it, vi } from 'vitest';
import portraits from '../../public/game/data/pet-portraits.json';
import skills from '../../public/game/data/pet-skills.json';
import panel from '../../public/game/data/pet-panel.json';

afterEach(() => vi.unstubAllGlobals());

describe('召唤兽资源加载状态', () => {
    it('并发共享请求，失败后统一显示错误，重试成功清除错误并安装完整资源', async () => {
        vi.resetModules();
        const state = await import('./pet-assets');
        let reject: (error: Error) => void = () => {};
        const failed = new Promise<never>((_resolve, fail) => {
            reject = fail;
        });
        const fetcher = vi.fn(() => failed);
        vi.stubGlobal('fetch', fetcher);
        const first = state.loadPetAssets();
        expect(state.loadPetAssets()).toBe(first);
        expect(fetcher).toHaveBeenCalledTimes(3);
        expect(state.petAssetsLoading.value).toBe(true);
        expect(state.petAssetsError.value).toBe('');
        expect(state.petAssets.value).toBeNull();
        const rejection = expect(first).rejects.toThrow('offline');
        reject(new Error('offline'));
        await rejection;
        expect(state.petAssetsLoading.value).toBe(false);
        expect(state.petAssetsError.value).toContain('重试');
        expect(state.petAssets.value).toBeNull();

        const files: Record<string, unknown> = {
            'pet-portraits.json': portraits,
            'pet-skills.json': skills,
            'pet-panel.json': panel,
        };
        const recovery = vi.fn(async (url: string) =>
            new Response(JSON.stringify(files[url.split('/').at(-1)!])),
        );
        vi.stubGlobal('fetch', recovery);
        const retry = state.loadPetAssets();
        expect(state.petAssetsLoading.value).toBe(true);
        expect(state.petAssetsError.value).toBe('');
        const loaded = await retry;
        expect(loaded.portraits.length).toBeGreaterThan(0);
        expect(loaded.skills.length).toBeGreaterThan(0);
        expect(loaded.panel.attributes.length).toBeGreaterThan(0);
        expect(state.petAssetsLoading.value).toBe(false);
        expect(state.petAssetsError.value).toBe('');
        expect(await state.loadPetAssets()).toBe(loaded);
        expect(recovery).toHaveBeenCalledTimes(3);
    });
});
