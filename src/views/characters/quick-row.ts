/** 卡片 quick 且非编辑态时补按钮语义；键盘仅响应行自身的 Enter / Space。 */
import { computed, type ComputedRef } from 'vue';

interface QuickRowBinds {
    role: 'button' | undefined;
    tabindex: 0 | undefined;
    'aria-label': string | undefined;
    onClick: () => void;
    onKeydown: (event: KeyboardEvent) => void;
}

/** 直接读取 props，保持 quick 与编辑态互斥。 */
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
            // 不处理输入框冒泡，避免编辑时打开快速修改。
            if (event.target !== event.currentTarget) return;
            // 按 key 判断输入意图；preventDefault 阻止滚动和表单提交。
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            activate();
        },
    };
}
