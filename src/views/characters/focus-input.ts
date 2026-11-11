import { nextTick, type Ref } from 'vue';

/** 等子组件挂好后聚焦指定输入格；宿主或目标尚未出现时安静跳过。 */
export async function focusInput(host: Ref<HTMLElement | null>, selector: string) {
    await nextTick();
    host.value?.querySelector<HTMLInputElement>(selector)?.focus();
}
