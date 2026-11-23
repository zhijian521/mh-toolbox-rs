/** 官网壁纸站的原图和缩略图均来自此目录。 */
export const WALLPAPER_CDN = 'https://nie.res.netease.com/r/pic/';

export function isWallpaperUrl(url: string): boolean {
    return (
        url.startsWith(WALLPAPER_CDN) &&
        /^\d{8}\/[a-z\d_-]+\.(?:jpg|jpeg|png)$/i.test(url.slice(WALLPAPER_CDN.length))
    );
}

/** 调用方在替换图片或销毁视图时释放返回的内存地址。 */
export async function loadWallpaperImage(url: string, signal: AbortSignal): Promise<string> {
    if (!isWallpaperUrl(url)) throw new Error('壁纸地址无效');
    const response = await fetch(url, {
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    if (!response.ok) throw new Error(`壁纸读取失败 (${response.status})`);
    const blob = await response.blob();
    signal.throwIfAborted();
    const objectUrl = URL.createObjectURL(blob);
    try {
        const image = new Image();
        image.src = objectUrl;
        await image.decode();
        signal.throwIfAborted();
        return objectUrl;
    } catch (error) {
        URL.revokeObjectURL(objectUrl);
        throw error;
    }
}
