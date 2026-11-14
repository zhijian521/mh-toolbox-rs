import { isObject, text } from './shape';

const REPOSITORY = 'zhijian521/mh-toolbox-rs';

export type UpdateResult =
    | { status: 'none' }
    | { status: 'current'; version: string }
    | { status: 'available'; version: string; url: string };

function version(value: string): { parts: number[]; preview: boolean } {
    const match =
        /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.exec(
            value,
        );
    if (!match) throw new Error('版本号格式无法识别');
    const parts = match.slice(1, 4).map(Number);
    if (!parts.every(Number.isSafeInteger)) throw new Error('版本号超出范围');
    return { parts, preview: Boolean(match[4]) };
}

export function releaseResult(raw: unknown, current: string): UpdateResult {
    if (!isObject(raw) || raw.draft === true || raw.prerelease === true) return { status: 'none' };
    const tag = text(raw.tag_name);
    const latest = version(tag),
        installed = version(current);
    if (latest.preview) return { status: 'none' };
    let newer = installed.preview;
    for (let index = 0; index < 3; index++) {
        if (latest.parts[index] === installed.parts[index]) continue;
        newer = latest.parts[index] > installed.parts[index];
        break;
    }
    if (!newer) return { status: 'current', version: tag };
    const url = new URL(text(raw.html_url));
    if (
        url.origin !== 'https://github.com' ||
        !url.pathname.startsWith(`/${REPOSITORY}/releases/tag/`) ||
        url.username ||
        url.password
    )
        throw new Error('下载页地址不属于本项目');
    return { status: 'available', version: tag, url: url.href };
}

/** 手动检查正式 Release；没有正式版本是正常状态，网络失败单独报告。 */
export async function checkUpdate(current: string): Promise<UpdateResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
        const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, {
            signal: controller.signal,
            cache: 'no-store',
            credentials: 'omit',
            redirect: 'error',
            headers: { Accept: 'application/vnd.github+json' },
        });
        if (response.status === 404) return { status: 'none' };
        if (response.status === 403 || response.status === 429)
            throw new Error('GitHub 查询受限，请稍后重试');
        if (!response.ok) throw new Error(`GitHub 查询失败（${response.status}）`);
        return releaseResult(await response.json(), current);
    } catch (error) {
        if (controller.signal.aborted) throw new Error('检查更新超时，请稍后重试');
        if (error instanceof TypeError) throw new Error('无法连接 GitHub，请检查网络后重试');
        throw error;
    } finally {
        clearTimeout(timer);
    }
}
