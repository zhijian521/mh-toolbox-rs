import { shallowRef } from 'vue';

/**
 * 二次确认：问一句「确定吗」，回来 `true` 或 `false`。
 *
 * ---- 为什么是函数而不是「每个页面各写一份 `<ConfirmDialog>`」 ----
 * 确认窗只有一件事要说，但每次用它都要在调用方攒三样东西：一个「现在开着没有」的 ref、
 * 一段模板里的 `v-if`、一组 `@confirm` / `@cancel` 的回调。物价页原先甚至为此多出
 * 三个 computed（标题、后果、目标物品）一整条链路，只为回答「删的是哪一件」。
 *
 * 改成 `await askConfirm({...})` 之后，调用点就只剩一句判断：确认了往下走，取消了原地不动。
 * 分支不再是「模板里两块」，而是**同一个函数里的下一行**——物价页「删整张卡」与
 * 「删一条记录」从此各自是一个函数，问句、后果、动作在同一个屏幕里读完。
 *
 * ---- 为什么是全局一个，而不是每个页面自己挂一个 ----
 * 「所有二次确认长一个样」这件事，只有真的只渲染一个宿主才守得住：各自挂一个，
 * 迟早有人调窄、调色、或给某处加个「不再提示」。宿主在 `App.vue` 里只写一次
 * （`components/ConfirmHost.vue`），页面拿到的只有这个函数。
 *
 * ---- 顺序上有一处必须注意 ----
 * `settle()` 先把状态清空再 `resolve`。反过来（先 resolve 再清空）的话，调用方拿到
 * `true` 之后如果**立刻**又开一个确认（比如「删完这条，要不要连带删掉空掉的卡」），
 * 新窗会被随后那句清空顺手抹掉——用户看到弹窗一闪。
 */

/** 确认文案与操作语义。 */
export interface ConfirmOptions {
    /** 删除、清空、覆盖等操作显式标记，不根据文案猜测。 */
    danger?: boolean;
    /** 问句本身，带书名号或引号。例：「删掉「高级魔兽要诀」这张卡？」 */
    title: string;
    /** 后果。写清会连带删掉什么、能不能撤回。可以没有。 */
    note?: string;
    /**
     * 确认键上的字。删除类动作可以就叫「删除」；
     * 导入是「替换」、清空是「清除」——同一个窗，动词跟着动作走。
     */
    confirmText?: string;
    /**
     * 取消键上的字，默认「取消」。它同时是那枚按钮的 `aria-label` 与悬停提示
     * （`PressButton` 把 `label` 用在两处），所以**必须与确认键是同一个动作的反面**：
     * 曾经写死「取消这次删除」，于是设置页的「替换 / 清除」两个窗，悬停取消键
     * 浮出的是「取消这次删除」，读屏也照念同一句。
     *
     * 默认值够用就不必传；要传的场景是「取消」两个字读起来不像这个动作的反面
     * （比如「不导入了」「保持现有数据」）。
     */
    cancelText?: string;
}

interface PendingConfirm extends ConfirmOptions {
    resolve: (ok: boolean) => void;
}

/** 当前挂着的那一句。`null` = 没有弹窗。模块级单例，全应用共用一个。 */
const pending = shallowRef<PendingConfirm | null>(null);

/** 问一句。确认 → `true`，取消 / Esc / 点遮罩 → `false`。
 *
 * ---- 为什么不叫 `confirm` ----
 * 浏览器全局就有 `window.confirm()`，返回值是 `boolean` 而不是 `Promise`。叫同名的话，
 * 哪个文件忘了 import，`await askConfirm(...)` 会静静地拿到 `undefined`——恒等于「取消」，
 * 动作永远不执行，而且**一条错都不报**（`lib.dom` 里真有这个函数）。
 * 换个名字，忘 import 就是 TS2304。
 */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        /* 上一个还挂着就先放走（当作取消）。不这么做，那个 `await` 永远不返回，
         * 它背后的 `finally` 也就永远不跑——按钮从此停在禁用态。 */
        pending.value?.resolve(false);
        pending.value = {
            note: '',
            confirmText: '删除',
            cancelText: '取消',
            danger: false,
            ...options,
            resolve,
        };
    });
}

/**
 * 给宿主用：读当前这一条，并回答它。**页面不要碰这两个**——
 * 页面只说 `askConfirm(...)`，「怎么画、怎么关」由 `ConfirmHost` 一处负责。
 */
export function useConfirmState() {
    function settle(ok: boolean) {
        const current = pending.value;
        /* 先清空再 resolve，理由见文件头那段。 */
        pending.value = null;
        current?.resolve(ok);
    }

    return { pending, settle };
}
