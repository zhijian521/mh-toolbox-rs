/** 六个业务数据层共用的写队列：未读或读失败时拒写，失败保留错误，关闭/导出前可等待。 */
import { readonly, ref, type DeepReadonly, type Ref } from 'vue';
import { hasDesktop } from './desktop';

export interface PersistOptions {
    /** 出错日志里的主语，如「物价表」「名册」「收益账」。不参与界面文案。 */
    label: string;
    loadError: Ref<string>;
    writeError: Ref<string>;
    /**
     * 这份数据**至少读过一轮**。
     *
     * 与 `loadError` 是两件事：那条说「读了但失败了」，这条说「读这件事发生过没有」。
     * 少了它挡不住最坏的一种——模块被 HMR 重算（`npm run dev` 里改一个文件就会），
     * 模块级单例回到空数组，而 `loadXxx()` 只在启动时跑过：这时 `loadError` 是空串，
     * 内存里却是空表，任何一次保存都会把库整份顶掉。2026-11-04 因此丢过 4 个角色，
     * 靠库快照救回；烟测侧当时补了「开头对账」，应用侧一直敞着。
     */
    loaded: Ref<boolean>;
    /** 浏览器路径（`npm run dev` / 探针）。错误由它自己兜住，这里不看返回值。 */
    writeLocal: () => void;
    /** 桌面路径。`false` = 没写进去，会变成界面上的红字。 */
    writeRemote: () => Promise<boolean>;
}

/**
 * 造一个 `persist()`：读失败时拒绝写、浏览器写本地、桌面版异步写库。
 *
 * ---- 为什么写入要排队 ----
 * 每次调用写的都是**当下全量**，所以「后发先至」在内容上不会坏——但**顺序**上会：
 * 连点两次记价，两份快照同时在路上，先发的那次若后到，库里就只剩前一份，
 * 而界面明明有两笔。这不是理论风险，记价与速记的用法本来就是连点。
 *
 * 两条出路：**合并**（攒 50ms 只写最后一次）看起来更快，但把「写完」与「点完」错开，
 * 用户点完就关窗口时最后一笔会丢；**排队**（这里）让每一份都真的落下去，
 * 且快照在**执行时**取，排队中的多次写拿到的是最新那份——重复写相同数据，
 * 但最后一次一定是对的。整份几百 KB、一天几十次的量级，这点时间不值得用丢账去换。
 *
 * 收益账从第 97 批起就有这条队列，物价与名册没有（同一套写法，三份里只有一份想到了）。
 * 抽到这里之后三处一致。
 */
export interface Persist {
    (): Promise<boolean>;
    pending: DeepReadonly<Ref<number>>;
    flush: () => Promise<boolean>;
    canWrite: () => boolean;
}

const writers = new Map<string, Persist>();

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
    const pending = ref(0);
    const canWrite = () => {
        if (options.loadError.value) return false;
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
        pending.value += 1;
        chain = chain.then(async () => {
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
