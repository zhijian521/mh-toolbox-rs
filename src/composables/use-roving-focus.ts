import { computed, nextTick, ref } from 'vue';

/** 方向键认哪一根轴。横排组只吃左右、竖排组只吃上下——四个方向全收会把页面滚动抢走。 */
export type RovingAxis = 'horizontal' | 'vertical' | 'both';

/**
 * 一组「整组只有一个 Tab 停靠点」的按钮（`radiogroup` / 导航列表）的键盘行为。
 *
 * 三件事必须同时成立，少一件读屏就会走丢：
 *   1. **只有当前项 `tabindex=0`**，其余 -1——Tab 把整组当一个停靠点，再按一次就离开；
 *   2. 方向键换选项后**把焦点带过去**，而不是只改选中态（焦点留在原地等于读屏还在念旧的）；
 *   3. `Home` / `End` 跳首尾，且要落到**可选**的那一项。
 *
 * 它顺带管「值 → 下标」的换算（`indexOf` / `activeIndex`）：方向键必须知道下一个
 * 可选的是谁，而四个控件的值类型不同（`string` / `FontScale` / 泛型 `T` / `boolean`），
 * 各写一份 `Math.max(0, findIndex(...))` 就是四种写法漂四种边界。
 *
 * **不负责选中状态本身**：`pick` 由调用方去 emit，`v-model` 仍是唯一真源。
 * 也不管 `role`——导航用 `aria-current`、单选组用 `aria-checked`，那是各控件自己的语义。
 *
 * `cells` 也由它持有：v-for 出来的元素数组是键盘落点，四个控件里一模一样，
 * 各写一份只会多出「ref 忘了传」这种错法。
 */
export function useRovingFocus<V>({
    values,
    activeValue,
    pick,
    axis = 'both',
    enabled = () => true,
    isDisabled = () => false,
}: {
    /** 全部选项的值，顺序即渲染顺序。 */
    values: () => readonly V[];
    /** 当前选中的值。找不到（比如传了个不存在的值）时按下标 0 处理。 */
    activeValue: () => V;
    /** 选中某一项（通常直接传组件里的 emit 包装）。 */
    pick: (index: number) => void;
    axis?: RovingAxis;
    /** 整组禁用时直接放行所有按键。 */
    enabled?: () => boolean;
    /** 单个选项是否不可选。方向键与 Home / End 都会跳过它。 */
    isDisabled?: (index: number) => boolean;
}) {
    /** 与选项一一对应的元素，由模板的 `ref="cells"` 填充。 */
    const cells = ref<HTMLElement[]>([]);

    const indexOf = (value: V) => {
        const index = values().findIndex((item) => Object.is(item, value));
        return index < 0 ? 0 : index;
    };

    const activeIndex = computed(() => indexOf(activeValue()));

    /* 只有当前项可 Tab：整组因此只占一个停靠点。 */
    const tabIndexFor = (index: number) => (index === activeIndex.value ? 0 : -1);

    /* 从 `from` 往 `dir` 方向找下一个可选中的项；一路到底都是禁用就停在原地。
     * 不能直接 `current + 1`：组里允许有禁用项（演示页那枚「已归档」就是），
     * 方向键撞上它必须跨过去，否则焦点会卡在一块点不动的格子上。 */
    function step(from: number, dir: 1 | -1): number {
        const last = values().length - 1;
        for (let i = from + dir; i >= 0 && i <= last; i += dir) {
            if (!isDisabled(i)) return i;
        }
        return from;
    }

    /* Home / End 要落到第一个（最后一个）**可选**的项，而不是第一个下标。 */
    function edge(dir: 1 | -1): number {
        return step(dir === 1 ? -1 : values().length, dir);
    }

    async function onKeydown(event: KeyboardEvent) {
        if (!enabled()) return;
        const current = activeIndex.value;
        /* 不给初值：不属于本轴的方向键要原样放行（见下面的 undefined 判断）。 */
        let next: number | undefined;

        switch (event.key) {
            case 'ArrowRight':
                if (axis !== 'vertical') next = step(current, 1);
                break;
            case 'ArrowLeft':
                if (axis !== 'vertical') next = step(current, -1);
                break;
            case 'ArrowDown':
                if (axis !== 'horizontal') next = step(current, 1);
                break;
            case 'ArrowUp':
                if (axis !== 'horizontal') next = step(current, -1);
                break;
            case 'Home':
                next = edge(1);
                break;
            case 'End':
                next = edge(-1);
                break;
            default:
                return;
        }

        /* 横排组收到上下键时 `next` 仍是 undefined：不 preventDefault，页面照常滚动。 */
        if (next === undefined) return;
        event.preventDefault();
        /* 到头了也不动，但仍吃掉按键——否则按左键会顺带滚一屏。 */
        if (next === current) return;
        pick(next);
        /* 等 DOM 换过 `tabindex` 再聚焦：否则焦点落在仍是 -1 的旧格上，Tab 会跳走。 */
        await nextTick();
        cells.value[next]?.focus();
    }

    return { cells, indexOf, activeIndex, tabIndexFor, onKeydown };
}
