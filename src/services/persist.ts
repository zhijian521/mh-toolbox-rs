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

        /* 还没读过库就写 = 拿空表覆盖。两件事分开报：这一条不是「磁盘有问题」，
         * 是「这一版代码还没看过库」，用户能做的只有刷新一次。 */
        if (!options.loaded.value) {
            console.error(`${options.label}还没读过库，跳过本次写入（这个页面刷新过吗？）`);
            options.writeError.value = '这一页还没读到数据，刷新一次再记';
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
