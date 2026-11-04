/**
 * 「模块级单例 + 整份写盘」的公共骨架。
 *
 * ---- 为什么会有这个文件 ----
 * 物价表、角色名册、收益账三份数据层的**形状**是同一套：
 *
 * - 读档：浏览器走 `localStorage`、桌面版走 SQLite；读失败挂 `loadError` 并**拒绝写入**；
 * - 写盘：整份写回、异步、不 `await`；失败把原因放进 `writeError` 交给界面。
 *
 * 这套东西到第 99 批为止是**三份手抄**。其中「首次启动把 `localStorage` 搬进 SQLite、
 * 搬成功才改名留底」那一段在物价与名册里几乎逐字相同，连注释都在解释同一件事。
 * 抄三份没出事，是因为每份都被人重新读了一遍；到账号 / 目标页要抄第四份时，
 * 漂移几乎是必然的，而这类漂移的**表现**不是报错，是「某一页的数据被空表覆盖」——
 * 等用户发现时原数据已经没了。所以把「怎么落地」抽到这里，规则仍归各家。
 *
 * ---- 这里**不**管什么 ----
 * 归一、排序、金额口径、种子数据、`storage` 事件监听，全部留在各自的 store 里。
 * 这个文件只回答两个问题：**这份数据怎么安全地写下去**、**老数据怎么搬一次**。
 */
import type { Ref } from 'vue';
import { hasDesktop } from './desktop';

export interface PersistOptions {
    /** 出错日志里的主语，如「物价表」「名册」「收益账」。不参与界面文案。 */
    label: string;
    loadError: Ref<string>;
    writeError: Ref<string>;
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
export function createPersist(options: PersistOptions): () => void {
    let chain: Promise<void> = Promise.resolve();

    return function persist(): void {
        /* 读失败时一律不写：这时内存里是空表，写下去就是整份覆盖。
         * 界面有红字告知，这条是代码侧的闸——即便将来多出一个写入口也拦得住。 */
        if (options.loadError.value) {
            console.error(
                `${options.label}处于读取失败状态，跳过本次写入`,
                options.loadError.value,
            );
            return;
        }

        if (!hasDesktop()) {
            options.writeLocal();
            return;
        }

        chain = chain
            .then(async () => {
                /* 快照在这一刻取（不是排队那一刻）：前一份刚写完，内存里已经是最新的一份。 */
                const ok = await options.writeRemote();
                options.writeError.value = ok ? '' : '这一笔没写进数据库，检查一下磁盘空间';
            })
            /* `desktop.ts` 每个命令都自己兜住了异常，这条只是保底：链上一旦漏出一个
             * reject，后面的 `.then` 全部不会执行，写入从此静默停摆。 */
            .catch((error: unknown) => {
                console.error(`${options.label}写入排队时出错`, error);
                options.writeError.value = '这一笔没写进数据库，检查一下磁盘空间';
            });
    };
}

export interface LegacyMigration<T> {
    /** `localStorage` 的键。留底写成 `<key>.migrated`，与各自 store 的读法一致。 */
    storageKey: string;
    /** 日志里的主语，如「旧物价表」「旧名册」。 */
    label: string;
    /** 三态：`true` 搬过 / `false` 没搬 / `null` 问不出来。 */
    imported: () => Promise<boolean | null>;
    readLegacy: () => T[] | null;
    saveAll: (items: T[]) => Promise<boolean>;
    markImported: () => Promise<void>;
}

/**
 * 把 `localStorage` 那一版搬进 SQLite，**只搬一次**。
 *
 * 返回「这次是不是首次启动」——名册要靠它在「库空且首次启动」时种两个演示角色，
 * 物价与收益账不需要，但调用方统一拿它即可。
 *
 * ---- 三条判据，每条都对应一次真实事故 ----
 *
 * 1. **`null` 不搬**。`imported()` 返回 `null` 是「问不出标记」（没有宿主 / 调用失败），
 *    把它当成「没搬过」会拿陈年的 `localStorage` 快照整份覆盖库；当成「搬过了」
 *    又可能永远漏搬。两边都是拿不准就动数据，所以干脆不搬，直接读库。
 * 2. **搬成功才动源数据**。先删后写一旦写失败就是永久丢数据；失败就什么都不做，
 *    下次启动再试。
 * 3. **留底用改名，不用删除**。库文件万一被误删 / 损坏，这里还留着一份可以捞；
 *    改名之后原来的读法再也读不到它，也就不会被重复搬。
 *
 * 留底那一步**必须兜住**：`localStorage` 配额满（这时等于写第二份副本，用量翻倍）
 * 或被策略禁用时 `setItem` 会抛，而这个函数在 `main.ts` 的 `Promise.all` 里——
 * 一抛就是启动白屏。数据已经在库里了，备份写不进去不该让应用起不来。
 */
export async function migrateLegacy<T>(options: LegacyMigration<T>): Promise<boolean> {
    const firstRun = (await options.imported()) === false;
    if (!firstRun) return false;

    const legacy = options.readLegacy();
    if (legacy && legacy.length) {
        const saved = await options.saveAll(legacy);
        if (saved && typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem(`${options.storageKey}.migrated`, JSON.stringify(legacy));
                localStorage.removeItem(options.storageKey);
            } catch (error) {
                console.error(`${options.label}留底失败（数据已入库，不影响使用）`, error);
            }
        }
    }

    /* 无论这次搬没搬到东西都打标记：留空也算问过一遍，否则每次启动都会再走一遍
     * 「读 localStorage → 试写库」，而在库已经是最新的时候，这个动作只有风险没有收益。 */
    await options.markImported();
    return true;
}
