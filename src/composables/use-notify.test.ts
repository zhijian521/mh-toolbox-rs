import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify, useNotifyState } from './use-notify';

/**
 * `use-notify` 的两条时间规则：**三秒一到就走**、**鼠标停着不算**。
 *
 * 这两条都在模块作用域里跑（`notices` / `timers` 是模块级单例），所以用假定时器
 * 直接推进时间，不碰组件、也不等真实的三秒。
 *
 * 每条用例结束后把列表清空：不清的话上一条留下的通知会挂在 `notices` 里，
 * 下一条的 `toHaveLength` 就永远绿——它会因为「本来就有」而通过。
 */

const { notices, hold, resume, dismiss } = useNotifyState();

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    /* 先按公开路径逐条收走（连同它们的计时器），再兜掉可能剩下的一次性定时器。 */
    for (const one of [...notices.value]) dismiss(one.id);
    vi.clearAllTimers();
    vi.useRealTimers();
});

describe('notify：自动收走', () => {
    it('三秒整才走：差 1ms 还在，到点就没', () => {
        notify.success('已删除');
        expect(notices.value.map((one) => one.text)).toEqual(['已删除']);

        vi.advanceTimersByTime(2999);
        expect(notices.value).toHaveLength(1);

        vi.advanceTimersByTime(1);
        expect(notices.value).toEqual([]);
    });

    it('三种语气进的是同一张列表，最新的在最后', () => {
        notify.success('已保存');
        notify.error('没删掉：库文件被占用');
        notify.info('已取消');

        expect(notices.value.map((one) => `${one.tone}:${one.text}`)).toEqual([
            'success:已保存',
            'error:没删掉：库文件被占用',
            'info:已取消',
        ]);
    });
});

describe('notify：最多三条', () => {
    it('第四条进来时挤掉最早那条，留下的是最近三次', () => {
        /* 连续删五条时，五张纸条一起压在屏幕中间就成了墙，而且最早那条已经过时——
         * 用户要的是「刚那下成了没有」，所以从旧的一头挤。 */
        notify.success('删掉第一条');
        notify.success('删掉第二条');
        notify.success('删掉第三条');
        notify.success('删掉第四条');

        expect(notices.value.map((one) => one.text)).toEqual([
            '删掉第二条',
            '删掉第三条',
            '删掉第四条',
        ]);
    });

    it('被挤掉那条的计时器一起清掉——不能留一个到点还去删已经不在的 id 的空转定时器', () => {
        notify.success('一');
        notify.success('二');
        notify.success('三');
        /* 到这里三条各有各的 3 秒表。再推一条把「一」挤走，然后把时间推过 3 秒：
         * 剩下的两条必须按时走，列表干净——没有谁的定时器在对着一个不存在的 id 空转。 */
        notify.success('四');
        vi.advanceTimersByTime(3000);

        expect(notices.value).toEqual([]);
    });
});

describe('notify：悬停 / 聚焦停表', () => {
    it('停表期间不消失，移开之后重新给满三秒', () => {
        notify.error('没删掉：这条记录已经被别处改过，刷新后再试');
        const [one] = notices.value;

        /* 读到一半停住：`hold` 清掉计时器，于是之后再推多久都还在。 */
        vi.advanceTimersByTime(2000);
        hold(one.id);
        vi.advanceTimersByTime(60_000);
        expect(notices.value).toHaveLength(1);

        /* 移开不是「接着剩下的 1 秒」，而是重新计满——鼠标离开那一刻人可能还没读完。 */
        resume(one.id);
        vi.advanceTimersByTime(2999);
        expect(notices.value).toHaveLength(1);

        vi.advanceTimersByTime(1);
        expect(notices.value).toEqual([]);
    });

    it('悬停期间被后来的三条挤掉，resume 不再给它排表（也不会把它弄回来）', () => {
        notify.success('第一条');
        const [first] = notices.value;
        hold(first.id);

        notify.success('第二条');
        notify.success('第三条');
        notify.success('第四条');
        expect(notices.value.map((one) => one.text)).not.toContain('第一条');

        /* 焦点离开时那句 `resume` 照样会被调用（元素已经没了）。它必须什么都不做：
         * 排一个表也只是三秒后对着一串不存在的 id 过滤一次。 */
        resume(first.id);
        expect(notices.value.map((one) => one.text)).not.toContain('第一条');

        vi.advanceTimersByTime(3000);
        expect(notices.value).toEqual([]);
    });
});
