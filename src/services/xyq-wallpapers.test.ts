import { afterEach, describe, expect, it, vi } from 'vitest';
import catalog from '../views/settings/xyq-wallpapers.json';
import { isWallpaperUrl, loadWallpaperImage, WALLPAPER_CDN } from './xyq-wallpapers';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('官网在线壁纸', () => {
    it('目录中每张原图唯一且原图与缩略图均来自官方图片目录', () => {
        expect(catalog.length).toBeGreaterThan(0);
        expect(new Set(catalog.map((item) => item.image)).size).toBe(catalog.length);
        for (const row of catalog) {
            expect(row.name.trim()).toBeTruthy();
            expect(isWallpaperUrl(WALLPAPER_CDN + row.image)).toBe(true);
            expect(isWallpaperUrl(WALLPAPER_CDN + row.thumb)).toBe(true);
        }
        expect(isWallpaperUrl(WALLPAPER_CDN + '../other.png')).toBe(false);
    });

    it('不使用 HTTP 缓存，无法解码的图会释放内存地址', async () => {
        const fetchImage = vi.fn(async () => new Response(new Blob(['invalid'])));
        vi.stubGlobal('fetch', fetchImage);
        vi.stubGlobal(
            'Image',
            class {
                decode() {
                    return Promise.reject(new Error('decode'));
                }
            },
        );
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:temporary');
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const url = WALLPAPER_CDN + catalog[0].image;
        await expect(loadWallpaperImage(url, new AbortController().signal)).rejects.toThrow(
            'decode',
        );
        expect(fetchImage).toHaveBeenCalledWith(
            url,
            expect.objectContaining({ cache: 'no-store', credentials: 'omit' }),
        );
        expect(revoke).toHaveBeenCalledWith('blob:temporary');
    });
});
