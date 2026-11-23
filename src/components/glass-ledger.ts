import type { Component, InjectionKey } from 'vue';

/** 复用账本组件的操作和布局，把材质交给玻璃页面。 */
export const glassLedger: InjectionKey<{
    card: Component;
    button: Component;
    overlayClass: string;
}> = Symbol('glassLedger');
