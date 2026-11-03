import { shallowRef } from 'vue';

/**
 * 消息提示：做完一件事之后说一句「已保存 / 已删除 / 出错了」，几秒后自己收走。
 *
 * ---- 与 `askConfirm` 的分工 ----
 * `askConfirm` 是**问**：它在等一个回答，回答之前谁都不许往下走。
 * 这里是**告知**：事情已经做完了（或者已经失败了），不需要回答，只需要看见。
 * 所以它没有返回值、不阻塞任何代码，调用点写在一行末尾即可。
 *
 * ---- 为什么不用页面里那行 `<p class="note">` ----
 * 行内提示只在「提示就在动作旁边」时成立。物价页的动作在网格里的卡片上，删完之后
 * 那条记录所在的位置已经没了——提示写在页头或卡片区上方，用户的眼睛还在原处，
 * 根本收不到。浮层出现在视线中间，说的又是刚刚那一下，才连得上。
 *
 * 设置页那张卡仍用行内 `.note`：那里的回执里带着自动备份的**路径**，需要停着读、
 * 需要能被复制，不该两秒就消失。判断标准是「这句话要不要留着看」，不是「这句话重不重要」。
 *
 * ---- 为什么状态在模块作用域 ----
 * 与 `use-confirm` 同一条：宿主 `NotifyHost` 全站只有一个，页面拿到的只有 `notify`
 * 这个对象。放进 `setup()` 的话每个页面各有一份列表，先开的那条会永远留在屏幕上。
 */

export type NoticeTone = 'success' | 'error' | 'info';

export interface Notice {
    id: number;
    text: string;
    tone: NoticeTone;
}

/** 一条停留多久。够读完一句「已删除」或一段十几字的失败原因，又不至于挡住下一眼。 */
const DURATION = 3000;

/**
 * 同时最多挂几条。
 *
 * 连续删五条时，五张纸条一起压在屏幕中间就成了「墙」，而且最后一条是最旧的。
 * 超出就从最早那条开始挤掉：最新的那一句永远在，它才是刚发生的事。
 */
const MAX = 3;

const notices = shallowRef<Notice[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let seq = 0;

function clearTimer(id: number) {
    const timer = timers.get(id);
    if (timer === undefined) return;
    clearTimeout(timer);
    timers.delete(id);
}

function dismiss(id: number) {
    clearTimer(id);
    notices.value = notices.value.filter((one) => one.id !== id);
}

/** 开始计时（或重新开始）。悬停离开时也走这里，于是「离开后再给满一秒」。 */
function startTimer(id: number) {
    clearTimer(id);
    timers.set(
        id,
        setTimeout(() => dismiss(id), DURATION),
    );
}

function push(tone: NoticeTone, text: string) {
    const id = (seq += 1);
    const next = [...notices.value, { id, text, tone }];
    /* 挤出最早的那条。它的计时器要一起清，否则那个 `setTimeout` 到点还会去 filter
     * 一次已经不在数组里的 id——不报错，但每次操作都留一个空转的定时器。 */
    while (next.length > MAX) {
        const dropped = next.shift();
        if (dropped) clearTimer(dropped.id);
    }
    notices.value = next;
    startTimer(id);
}

/**
 * 说一句。三种语气各一个方法，调用点读起来就是「做完了 → 提示」：
 *
 * ```ts
 * notify.success('已删除');
 * notify.error(result.error);
 * ```
 */
export const notify = {
    success(text: string) {
        push('success', text);
    },
    error(text: string) {
        push('error', text);
    },
    info(text: string) {
        push('info', text);
    },
};

/**
 * 给宿主用：列表 + 悬停暂停 + 点掉。**页面不要碰这些**——页面只说 `notify.xxx()`。
 *
 * 悬停暂停是给「话比预期长」留的余地：鼠标停上去就停表，移开重新计满。
 * 不加这个的话，一句带着原因的错误提示读到一半会消失。
 */
export function useNotifyState() {
    function hold(id: number) {
        clearTimer(id);
    }

    function resume(id: number) {
        /* 已经不在列表里的（悬停期间被后来的提示挤掉）就不要再排一个计时器。 */
        if (!notices.value.some((one) => one.id === id)) return;
        startTimer(id);
    }

    return { notices, hold, resume, dismiss };
}
