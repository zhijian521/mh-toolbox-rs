import { getSurface } from 'glassy-liquid/elements';
import type { GlassOptions } from 'glassy-liquid';
import * as Glass from 'glassy-liquid/vue';
import { computed, defineComponent, h, mergeProps, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import type { Component } from 'vue';

type GlassTarget = 'surface' | 'content' | 'thumb' | 'selector' | 'tabBar' | 'menu' | 'sheet' | 'scrollEdge';

// Dock 的弧边由材质引擎绘制。共用折射和高光，让内容底色、弹层模糊度各自独立。
const dockEdge = { bezel: 8, refraction: 15, specular: 1.1 } satisfies GlassOptions;
const controlGlass = {
    bezel: 6, refraction: 12, specular: 0.72, material: 'clear', blur: 0.6,
    fill: 'light-dark(#f8fffc16, #15222530)', shadow: '0 1px 3px #152a3424',
} satisfies GlassOptions;
const contentGlass = {
    ...controlGlass, bezel: 5, refraction: 10, specular: 0.56, blur: 1.8, shadow: '0 2px 5px #152a3419',
} satisfies GlassOptions;
const dockGlass = { ...controlGlass, ...dockEdge };
export const popupGlass = {
    ...dockEdge, radius: 26, material: 'regular', blur: 4,
    fill: 'light-dark(rgb(247 255 252 / 0.24), rgb(18 29 25 / 0.32))',
} satisfies GlassOptions;
const thumbGlass = { material: 'clear', blur: 0.6, fill: null } satisfies GlassOptions;

function partSurface(host: HTMLElement, part: string) {
    const element = host.shadowRoot?.querySelector(`[part~="${part}"]`);
    return element ? getSurface(element) : undefined;
}

function updateMaterial(host: HTMLElement, target: GlassTarget) {
    switch (target) {
        case 'content':
            getSurface(host)?.set({ fill: 'var(--lg-content-fill, var(--lg-content-base))' });
            break;
        case 'surface':
        case 'tabBar': {
            const surface = getSurface(host);
            if (surface?.options.backdrop) {
                surface.set({ fill: `var(--lg-surface-fill, ${controlGlass.fill})` });
            }
            if (target === 'tabBar') partSurface(host, 'lens')?.set(thumbGlass);
            break;
        }
        case 'selector':
            partSurface(host, 'lens')?.set({ ...thumbGlass, ...dockEdge });
            break;
        case 'thumb':
            partSurface(host, 'thumb')?.set({ ...thumbGlass, ...dockEdge });
            break;
        case 'menu':
            // 菜单在第一次展开时读取 glass。已创建的面板需要同步更新。
            Object.assign(host, { glass: popupGlass });
            partSurface(host, 'panel')?.set(popupGlass);
            break;
        case 'sheet':
            partSurface(host, 'sheet')?.set({
                ...dockEdge,
                fill: popupGlass.fill,
            });
            break;
    }
}

function themed<T extends Component>(component: T, target?: GlassTarget): T {
    const hasMaterialProp = target === 'surface' || target === 'content' || target === 'tabBar' || target === 'sheet';
    const wrapper = defineComponent({
        name: component.name,
        inheritAttrs: false,
        setup(_, { attrs, slots, expose }) {
            const child = shallowRef<{ el: HTMLElement | null } | null>(null);
            const el = computed(() => child.value?.el ?? null);
            expose({ el });

            function syncMaterial() {
                if (el.value && target) updateMaterial(el.value, target);
            }

            onMounted(() => {
                syncMaterial();
                if (target === 'sheet') el.value?.addEventListener('toggle', syncMaterial);
            });
            onBeforeUnmount(() => {
                if (target === 'sheet') el.value?.removeEventListener('toggle', syncMaterial);
            });

            return () => {
                const options: Record<string, unknown> = {};
                if (hasMaterialProp) {
                    const surface: GlassOptions = target === 'sheet' ? popupGlass
                        : target === 'content' ? contentGlass
                        : target === 'tabBar' ? dockGlass : controlGlass;
                    options.material = surface.material;
                    for (const key of ['blur', 'specular', 'bezel', 'refraction', 'shadow'] as const) {
                        // Vue 对自定义元素会把「元素实例上已存在的同名属性」直接写成 DOM
                        // property（`'shadow' in el` → `el.shadow = value`）。`<glass-sheet>`
                        // 把 ShadowRoot 存在实例字段 `this.shadow` 上，任何同名 prop——
                        // 哪怕值是 undefined——都会把它覆盖掉；下一次 connectedCallback 调
                        // adoptStyles(this.shadow) 就抛 "adoptedStyleSheets of undefined"，
                        // 面板停在 0×0，历史等用 sheet 的弹窗全部打不开。面板阴影由
                        // updateMaterial('sheet') 经 part(sheet).set 设置，不靠这个 prop。
                        if (target === 'sheet' && key === 'shadow') continue;
                        const value = attrs[key] ?? surface[key];
                        // 空值也别传：undefined 同样会被写成 el[key] = undefined。
                        if (value !== undefined) options[key] = value;
                    }
                } else if (target === 'scrollEdge') {
                    options.blur = attrs.blur ?? 2;
                }
                return h(
                    component,
                    mergeProps(attrs, options, {
                        ref: child,
                        class: 'lg-component',
                        // 原生组件先等 Vue 绑定写入 props，再初始化表单值和菜单的 ARIA 状态。
                        'defer-hydration': '',
                    }),
                    slots,
                );
            };
        },
    });
    // 包装器透传公共 props、监听器和插槽，同时保留原绑定的 v-model 类型。
    return wrapper as unknown as T;
}

export const GlassSurface = themed(Glass.GlassSurface, 'surface');
export const GlassCard = themed(Glass.GlassSurface, 'content');
export const GlassButton = themed(Glass.GlassButton, 'surface');
export const GlassSwitch = themed(Glass.GlassSwitch, 'thumb');
export const GlassSlider = themed(Glass.GlassSlider, 'thumb');
export const GlassTabBar = themed(Glass.GlassTabBar, 'tabBar');
export const GlassTab = themed(Glass.GlassTab);
export const GlassSegmented = themed(Glass.GlassSegmented, 'selector');
export const GlassSegment = themed(Glass.GlassSegment);
export const GlassMenu = themed(Glass.GlassMenu, 'menu');
export const GlassMenuItem = themed(Glass.GlassMenuItem);
export const GlassMenuLabel = themed(Glass.GlassMenuLabel);
export const GlassMenuSeparator = themed(Glass.GlassMenuSeparator);
export const GlassToolbar = themed(Glass.GlassToolbar);
export const GlassGroup = themed(Glass.GlassGroup, 'surface');
export const GlassSpacer: typeof Glass.GlassSpacer = themed(Glass.GlassSpacer);
export const GlassSearch = themed(Glass.GlassSearch, 'content');
export const GlassSheet = themed(Glass.GlassSheet, 'sheet');
export const GlassProgressiveBlur = themed(Glass.GlassProgressiveBlur, 'scrollEdge');
export const GlassScene = themed(Glass.GlassScene);
