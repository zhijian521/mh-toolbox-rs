import { afterEach, describe, expect, it } from 'vitest';
import { askConfirm, useConfirmState } from './use-confirm';

/**
 * `askConfirm` 的两个不变量：**谁在等、谁先被放走**。
 *
 * 这个 composable 没有可渲染的产物，全部后果都落在 Promise 上——所以测试也不必碰
 * 组件，只要问「我 await 的这一句回来了没有、回来的是哪一半」。
 *
 * `pending` 是模块级单例，用例之间共用一份；每条结束后收干净，否则上一条挂着的那句
 * 会让下一条的 `pending.value` 断言假绿（它本来就在，不是这一次开的）。
 */

const { pending, settle } = useConfirmState();

afterEach(() => {
    /* 收尾只走 `settle` 这一条公开路径：它就是宿主在用户点「取消」时做的事。 */
    if (pending.value !== null) settle(false);
});

describe('askConfirm：默认值', () => {
    it('只给问句时，两个按钮都用默认字', async () => {
        const answered = askConfirm({ title: '删掉「高级魔兽要诀」这张卡？' });

        expect(pending.value).toMatchObject({
            title: '删掉「高级魔兽要诀」这张卡？',
            note: '',
            confirmText: '删除',
            cancelText: '取消',
        });

        settle(false);
        await expect(answered).resolves.toBe(false);
    });

    it('调用方给的字原样带到宿主，不被默认值盖掉', async () => {
        /* 「替换 / 清除」这两个动作曾经共用写死的「取消这次删除」：确认键跟着动作变了，
         * 取消键没变。这条断言守的就是「两个键都跟着动作走」。 */
        const answered = askConfirm({
            title: '清空所有角色与物价？',
            note: '清掉之后找不回来。',
            confirmText: '清除',
            cancelText: '取消清除',
        });

        expect(pending.value).toMatchObject({ confirmText: '清除', cancelText: '取消清除' });

        settle(true);
        await expect(answered).resolves.toBe(true);
    });
});

describe('askConfirm：回答', () => {
    it('settle(true) 回 true，settle(false) 回 false，且答完状态就清空', async () => {
        const yes = askConfirm({ title: '删掉这一条？' });
        settle(true);
        await expect(yes).resolves.toBe(true);
        expect(pending.value).toBeNull();

        const no = askConfirm({ title: '删掉这一条？' });
        settle(false);
        await expect(no).resolves.toBe(false);
        expect(pending.value).toBeNull();
    });

    it('上一句还挂着时又问一句：前一个立刻按「取消」放走，窗只剩新的那句', async () => {
        /* 为什么要放走而不是排队的理由：那个 `await` 永远不返回的话，它背后的
         * `finally` 也不跑——按钮从此停在禁用态。这条断言就是那个后果的反面。
         *
         * 也顺带守住顺序：必须先 resolve 旧的、再挂新的。反过来写的话，
         * `settle` 里那句清空会把刚挂上去的新窗一起抹掉，用户看到弹窗一闪。 */
        const first = askConfirm({ title: '删掉「高级魔兽要诀」这张卡？' });
        const second = askConfirm({ title: '删掉 11-03 这条价格记录？' });

        await expect(first).resolves.toBe(false);
        expect(pending.value?.title).toBe('删掉 11-03 这条价格记录？');

        settle(true);
        await expect(second).resolves.toBe(true);
        expect(pending.value).toBeNull();
    });
});
