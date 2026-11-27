/** 各业务数据层共用的写队列：未读或读失败时拒写，失败保留错误，关闭/导出前可等待。 */
import { readonly, ref, type DeepReadonly, type Ref } from 'vue';
import { hasDesktop } from './desktop';

export interface PersistOptions {
    /** 出错日志里的主语，如「物价表」「名册」「收益账」。不参与界面文案。 */
    label: string;
    loadError: Ref<string>;
    writeError: Ref<string>;
    /** 成功读取后才可写，避免模块重载产生的空状态覆盖已有数据。 */
    loaded: Ref<boolean>;
    /** 浏览器路径（`npm run dev` / 探针）。错误由它自己兜住，这里不看返回值。 */
    writeLocal: () => void;
    /** 桌面路径。`false` = 没写进去，会变成界面上的红字。 */
    writeRemote: () => Promise<boolean>;
}

/** 已开始的全量写入串行执行，未开始的请求合并；回执及 flush 等待实际结果。 */
export interface Persist {
    (): Promise<boolean>;
    pending: DeepReadonly<Ref<number>>;
    flush: () => Promise<boolean>;
    canWrite: () => boolean;
}

const writers = new Map<string, Persist>();
const replacementActive = ref(false);
export const ledgerWritesBlocked = readonly(replacementActive);
const ledgerDrains = new Set<() => boolean>();

export function registerLedgerDrain(drain: () => boolean) {
    ledgerDrains.add(drain);
    return () => ledgerDrains.delete(drain);
}

/** 整账替换前先收齐防抖队列，替换期间暂停领域写入。 */
export async function withLedgerReplacement<T>(
    replace: () => Promise<T>,
    waitsForReload: (result: T) => boolean,
): Promise<T> {
    if (replacementActive.value) throw new Error('账本正在替换，请稍候');
    for (const drain of ledgerDrains) {
        if (!drain()) throw new Error('仍有数据未同步，请先重试同步');
    }
    replacementActive.value = true;
    let reloading = false;
    try {
        if (!(await flushPendingWrites())) throw new Error('仍有数据未保存，请先重试保存');
        const result = await replace();
        reloading = waitsForReload(result);
        return result;
    } finally {
        if (!reloading) replacementActive.value = false;
    }
}

/** 导出、替换和关闭窗口前等待所有队列，失败时由调用方保留窗口并告知用户。 */
export async function flushPendingWrites(): Promise<boolean> {
    let results: boolean[];
    do {
        results = await Promise.all([...writers.values()].map((writer) => writer.flush()));
    } while ([...writers.values()].some((writer) => writer.pending.value > 0));
    return results.every(Boolean);
}

export function createPersist(options: PersistOptions): Persist {
    let chain: Promise<boolean> = Promise.resolve(true);
    let queued: Promise<boolean> | undefined;
    const pending = ref(0);
    const canWrite = () => {
        if (ledgerWritesBlocked.value || options.loadError.value) return false;
        if (!options.loaded.value) {
            options.loadError.value = '这一页还没读到数据，刷新一次再记';
            return false;
        }
        return true;
    };
    function persist(): Promise<boolean> {
        if (!canWrite()) return Promise.resolve(false);
        if (!hasDesktop()) {
            options.writeError.value = '';
            try {
                options.writeLocal();
            } catch (error) {
                console.error(options.label + '写入失败', error);
                options.writeError.value = '这一笔没存下来，检查一下浏览器存储空间';
            }
            return Promise.resolve(!options.writeError.value);
        }
        if (queued) return queued;
        pending.value += 1;
        chain = chain.then(async () => {
            queued = undefined;
            try {
                const ok = await options.writeRemote();
                options.writeError.value = ok ? '' : '这一笔没写进数据库，检查一下磁盘空间';
                return ok;
            } catch (error) {
                console.error(options.label + '写入排队时出错', error);
                options.writeError.value = '这一笔没写进数据库，检查一下磁盘空间';
                return false;
            } finally {
                pending.value -= 1;
            }
        });
        queued = chain;
        return chain;
    }
    const writer = Object.assign(persist, {
        pending: readonly(pending),
        canWrite,
        async flush() {
            let current;
            do {
                current = chain;
                await current;
            } while (current !== chain);
            return !options.writeError.value;
        },
    });
    writers.set(options.label, writer);
    return writer;
}
