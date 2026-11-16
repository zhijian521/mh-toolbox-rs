import { shallowRef } from 'vue';

/** 全应用共用 ConfirmHost；页面通过 askConfirm 等待结果。 */

/** 确认文案与操作语义。 */
export interface ConfirmOptions {
    /** 删除、清空、覆盖等操作显式标记，不根据文案猜测。 */
    danger?: boolean;
    /** 问句本身，带书名号或引号。例：「删掉「高级魔兽要诀」这张卡？」 */
    title: string;
    /** 后果。写清会连带删掉什么、能不能撤回。可以没有。 */
    note?: string;
    /** 确认按钮文案，随操作指定。 */
    confirmText?: string;
    /** 默认「取消」；纯结果通知可传空串隐藏取消键。 */
    cancelText?: string;
}

interface PendingConfirm extends ConfirmOptions {
    resolve: (ok: boolean) => void;
}

/** 当前挂着的那一句。`null` = 没有弹窗。模块级单例，全应用共用一个。 */
const pending = shallowRef<PendingConfirm | null>(null);

/** 确认返回 true；取消、Esc 与遮罩关闭返回 false。 */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        // 新请求先取消旧请求，避免调用方一直等待。
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

/** 仅由 ConfirmHost 读取和关闭当前请求。 */
export function useConfirmState() {
    function settle(ok: boolean) {
        const current = pending.value;
        // 先清空再 resolve，避免抹掉调用方紧接着创建的新确认。
        pending.value = null;
        current?.resolve(ok);
    }

    return { pending, settle };
}
