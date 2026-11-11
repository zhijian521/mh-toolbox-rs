/**
 * 「可点时整行是一枚按钮」——那六个绑定只有这一份。
 *
 * 为什么要抽：属性、经验、辅助、修炼、师门五行都是 `div`，可点时才补
 * `role="button"` + `tabindex="0"` + Enter / Space。这套东西原先在五个文件里各抄一遍，
 * 而**漏掉其中一条是看不出来的**：鼠标照样能点，只有键盘用户按空格时没反应——
 * 现有的截图与几何断言都不会红。
 *
 * 与 `CONVENTIONS.md` §37 是同一条口径（可点时补、不可点时一个都不给），这里只是把
 * 「一个都不给」变成默认值，让漏写在代码上不成立。
 *
 * ---- 为什么是函数而不是 composable ----
 * 它不持有任何状态，也不需要 `onMounted` / `watch`；行在 `v-for` 里，每行一份绑定，
 * 组件 setup 阶段根本没有「这一行」。所以在模板里就地调：`v-bind="quickRowBinds(...)"`。
 * `quickable` 是 computed，渲染时读到它，条件变化自然重算。
 *
 * `useQuickable` 是这条规矩的唯一例外，因为它必须拿到 `props` 才能响应式：四个页面原先
 * 各写一句逐字相同的 `computed(() => props.quick && !props.editable)`。它同样不持有状态、
 * 不挂生命周期，只是把那一句收成一处——`quick` 与 `editable` 的互斥关系（可编辑的那一态
 * 里等级已经是输入格，再开窗就成了「点输入框弹出另一个输入框」）只该有一个表述。
 */
import { computed, type ComputedRef } from 'vue';

export interface QuickRowBinds {
    role: 'button' | undefined;
    tabindex: 0 | undefined;
    'aria-label': string | undefined;
    onClick: () => void;
    onKeydown: (event: KeyboardEvent) => void;
}

/**
 * 这一行此刻能不能点：卡上（`quick`）且不是编辑态（`editable`）。
 *
 * 传 `props` 而不是两个布尔值：四个调用点都在组件 setup 里，直接 `useQuickable(props)`
 * 就得到一枚跟着 props 走的 computed。
 */
export function useQuickable(props: { quick?: boolean; editable?: boolean }): ComputedRef<boolean> {
    return computed(() => props.quick === true && props.editable !== true);
}

/**
 * @param quickable 这一行此刻能不能点（通常是 `quick && !editable`）。
 * @param activate 点下去做什么。不可点时它自己也要有守卫——这里只在键上先挡一层。
 * @param label 读屏念的整句，如 `快速修改 气血`。
 */
export function quickRowBinds(
    quickable: boolean,
    activate: () => void,
    label: string,
): QuickRowBinds {
    return {
        role: quickable ? 'button' : undefined,
        tabindex: quickable ? 0 : undefined,
        'aria-label': quickable ? label : undefined,
        onClick: activate,
        onKeydown(event: KeyboardEvent) {
            if (!quickable) return;
            /* `target !== currentTarget` 就是原先的 `.self`：票里还嵌着输入格与数字格，
             * 没有这一条，在格子里敲空格会顺带把窗打开。
             *
             * `preventDefault` 是原先的 `.prevent`：空格默认滚一屏，Enter 在表单里
             * 会提交——这两个副作用都不能留给浏览器。 */
            if (event.target !== event.currentTarget) return;
            /* 空格是 `' '`（`event.code` 才是 `'Space'`）。用 `key` 而不是 `code`：
             * 中文输入法下 `code` 仍是 Space，但 `key` 才代表「用户按了空格」。 */
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            activate();
        },
    };
}
