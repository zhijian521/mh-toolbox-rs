import { getSurface } from 'glassy-liquid/elements';
import type { GlassOptions } from 'glassy-liquid';
import * as Glass from 'glassy-liquid/vue';
import {
    computed,
    defineComponent,
    h,
    inject,
    mergeProps,
    nextTick,
    provide,
    onBeforeUnmount,
    onMounted,
    shallowRef,
    watch,
} from 'vue';
import type { Component, InjectionKey, PropType, Ref } from 'vue';
import { useLiquidPreferences, type LiquidMaterial } from '../../composables/use-liquid-preferences';

type GlassTarget = 'surface' | 'content' | 'thumb' | 'selector' | 'tabBar' | 'menu' | 'sheet' | 'scrollEdge';

const classic = {
    glass: {
        material: 'clear', blur: 4, specular: 1.25,
        fill: 'light-dark(rgb(249 252 250 / 0.26), rgb(21 32 31 / 0.35))',
    },
    card: { blur: 4, specular: 0.52, shadow: '0 2px 6px rgb(16 35 30 / 0.07)' },
    popup: {
        radius: 26, material: 'regular', blur: 7, specular: 1.15,
        fill: 'light-dark(rgb(247 255 252 / 0.24), rgb(18 29 25 / 0.32))',
    },
    lens: { material: 'clear', blur: 1.5, fill: null },
    scrollBlur: 4,
} satisfies Record<'glass' | 'card' | 'popup' | 'lens', GlassOptions> & { scrollBlur: number };

const profiles = {
    classic,
    lens: {
        glass: {
            material: 'clear', bezel: 8, refraction: 15, blur: 0.6, specular: 1.1,
            fill: 'light-dark(#f8fffc16, #15222530)', shadow: '0 1px 3px #152a3424',
        },
        card: { bezel: 7, refraction: 10, blur: 1.8, specular: 0.85, shadow: '0 2px 5px #152a3419' },
        popup: { ...classic.popup, blur: 4, specular: 0.85 },
        lens: { ...classic.lens, blur: 0.6 },
        scrollBlur: 2,
    },
} as const;

const { material } = useLiquidPreferences();
export const popupGlass = computed(() => profiles[material.value].popup);
const materialScope: InjectionKey<Readonly<Ref<LiquidMaterial>>> = Symbol('liquid-material');

function partSurface(host: HTMLElement, part: string) {
    const element = host.shadowRoot?.querySelector(`[part~="${part}"]`);
    return element ? getSurface(element) : undefined;
}

function updateMaterial(host: HTMLElement, target: GlassTarget, preset: typeof profiles[LiquidMaterial]) {
    // 引擎只合并传入的字段；切回经典时释放由清透预设写入的参数。
    if (preset === classic && (target === 'content' || target === 'surface' || target === 'tabBar')) {
        const surface = getSurface(host);
        if (surface?.options.backdrop) {
            const reset: GlassOptions = {};
            for (const key of ['bezel', 'refraction', 'shadow'] as const) {
                if (!host.hasAttribute(key)) reset[key] = undefined;
            }
            surface.set(reset);
        }
    }
    switch (target) {
        case 'content':
            getSurface(host)?.set({ fill: 'var(--lg-content-fill, var(--lg-content-base))' });
            break;
        case 'surface':
        case 'tabBar': {
            const surface = getSurface(host);
            if (surface?.options.backdrop) {
                surface.set({ fill: `var(--lg-surface-fill, ${preset.glass.fill})` });
            }
            if (target === 'tabBar') partSurface(host, 'lens')?.set(preset.lens);
            break;
        }
        case 'selector':
            partSurface(host, 'lens')?.set(preset.lens);
            break;
        case 'thumb':
            partSurface(host, 'thumb')?.set(preset.lens);
            break;
        case 'menu':
            // 菜单在第一次展开时读取 glass。已创建的面板需要同步更新。
            Object.assign(host, { glass: preset.popup });
            partSurface(host, 'panel')?.set(preset.popup);
            break;
        case 'sheet':
            partSurface(host, 'sheet')?.set({
                fill: preset.popup.fill,
                specular: preset.popup.specular,
            });
            break;
    }
}

function themed<T extends Component>(component: T, target?: GlassTarget): T {
    const hasMaterialProp = target === 'surface' || target === 'content' || target === 'tabBar' || target === 'sheet';
    const wrapper = defineComponent({
        name: component.name,
        inheritAttrs: false,
        props: { materialStyle: String as PropType<LiquidMaterial> },
        setup(props, { attrs, slots, expose }) {
            const inherited = inject(materialScope, material);
            const style = computed(() => props.materialStyle ?? inherited.value);
            provide(materialScope, style);
            const child = shallowRef<{ el: HTMLElement | null } | null>(null);
            const el = computed(() => child.value?.el ?? null);
            expose({ el });

            function syncMaterial() {
                if (el.value && target) updateMaterial(el.value, target, profiles[style.value]);
            }

            // Vue 绑定在子组件 updated 时才移除旧属性，之后再同步引擎里的填充和折射。
            watch(style, () => nextTick(syncMaterial), { flush: 'post' });
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
                    const preset = profiles[style.value];
                    const surface: GlassOptions = target === 'sheet' ? preset.popup
                        : target === 'content' ? { ...preset.glass, ...preset.card } : preset.glass;
                    options.material = surface.material;
                    for (const key of ['blur', 'specular', 'bezel', 'refraction', 'shadow'] as const) {
                        options[key] = attrs[key] ?? surface[key];
                    }
                } else if (target === 'scrollEdge') {
                    options.blur = attrs.blur ?? profiles[style.value].scrollBlur;
                }
                return h(
                    component,
                    mergeProps(attrs, options, {
                        ref: child,
                        class: 'lg-component',
                        'data-glass-style': style.value,
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
