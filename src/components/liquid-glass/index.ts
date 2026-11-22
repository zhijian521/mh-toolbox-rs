import { getSurface } from 'glassy-liquid/elements';
import type { GlassOptions } from 'glassy-liquid';
import * as Glass from 'glassy-liquid/vue';
import {
    computed,
    defineComponent,
    h,
    inject,
    mergeProps,
    onBeforeUnmount,
    onMounted,
    onUpdated,
    provide,
    shallowRef,
} from 'vue';
import type { Component, InjectionKey, PropType, Ref } from 'vue';

export type GlassMode = 'clear' | 'frosted';

type GlassTarget = 'surface' | 'thumb' | 'selector' | 'tabBar' | 'menu' | 'sheet' | 'scrollEdge';

type SurfaceMaterial = GlassOptions &
    Required<Pick<GlassOptions, 'material' | 'blur' | 'fill' | 'specular'>>;

interface MaterialPreset {
    glass: SurfaceMaterial;
    popup: SurfaceMaterial;
    lens: GlassOptions;
    scrollBlur: number;
}

const presets: Record<GlassMode, MaterialPreset> = {
    clear: {
        glass: { material: 'clear', blur: 0.6, fill: 'rgb(0 0 0 / 0.10)', specular: 1.25 },
        popup: {
            material: 'regular',
            blur: 7,
            fill: 'light-dark(rgb(247 255 252 / 0.24), rgb(18 29 25 / 0.32))',
            specular: 1.15,
        },
        lens: { material: 'clear', blur: undefined, fill: null },
        scrollBlur: 4,
    },
    frosted: {
        glass: { material: 'regular', blur: 7, fill: 'rgb(16 23 22 / 0.35)', specular: 1.05 },
        popup: { material: 'regular', blur: 18, fill: null, specular: 1.05 },
        lens: { material: 'regular', blur: 4, fill: 'rgb(229 241 234 / 0.45)' },
        scrollBlur: 12,
    },
};
const glassModeKey: InjectionKey<Readonly<Ref<GlassMode>>> = Symbol('liquidglass-mode');
const defaultMode = shallowRef<GlassMode>('frosted');

export const GlassProvider = defineComponent({
    name: 'GlassProvider',
    props: {
        mode: { type: String as PropType<GlassMode> },
    },
    setup(props, { slots }) {
        const parentMode = inject(glassModeKey, defaultMode);
        const mode = computed(() => props.mode ?? parentMode.value);
        provide(glassModeKey, mode);
        return () =>
            h('div', { class: 'lg-provider', 'data-lg-mode': mode.value }, slots.default?.());
    },
});

function partSurface(host: HTMLElement, part: string) {
    const element = host.shadowRoot?.querySelector(`[part~="${part}"]`);
    return element ? getSurface(element) : undefined;
}

function updateMaterial(host: HTMLElement, target: GlassTarget, preset: MaterialPreset) {
    switch (target) {
        case 'surface':
        case 'tabBar': {
            const surface = getSurface(host);
            if (surface?.options.backdrop) surface.set({ fill: preset.glass.fill });
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
    const hasMaterialProp = target === 'surface' || target === 'tabBar' || target === 'sheet';
    const wrapper = defineComponent({
        name: component.name,
        inheritAttrs: false,
        setup(_, { attrs, slots, expose }) {
            const sharedMode = inject(glassModeKey, defaultMode);
            const child = shallowRef<{ el: HTMLElement | null } | null>(null);
            const el = computed(() => child.value?.el ?? null);
            function resolveMode() {
                if (hasMaterialProp && attrs.material === 'clear') return 'clear';
                if (hasMaterialProp && attrs.material === 'regular') return 'frosted';
                return sharedMode.value;
            }
            expose({ el });

            let appliedMode: GlassMode | undefined;
            function syncMaterial() {
                const host = el.value;
                const mode = resolveMode();
                if (!host || !target || mode === appliedMode) return;
                updateMaterial(host, target, presets[mode]);
                appliedMode = mode;
            }

            function updateSheet() {
                appliedMode = undefined;
                syncMaterial();
            }

            onMounted(() => {
                syncMaterial();
                if (target === 'sheet') el.value?.addEventListener('toggle', updateSheet);
            });
            onBeforeUnmount(() => {
                if (target === 'sheet') el.value?.removeEventListener('toggle', updateSheet);
            });
            onUpdated(syncMaterial);

            return () => {
                const mode = resolveMode();
                const preset = presets[mode];
                const options: Record<string, unknown> = {};
                if (hasMaterialProp) {
                    const surface = target === 'sheet' ? preset.popup : preset.glass;
                    options.material = surface.material;
                    options.blur = attrs.blur ?? surface.blur;
                    if (target !== 'sheet')
                        options.specular = attrs.specular ?? preset.glass.specular;
                } else if (target === 'scrollEdge') {
                    options.blur = attrs.blur ?? preset.scrollBlur;
                }
                return h(
                    component,
                    mergeProps(attrs, options, {
                        ref: child,
                        class: 'lg-component',
                        'data-lg-mode': mode,
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
export { GlassSurface as GlassCard };
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
export const GlassSearch = themed(Glass.GlassSearch, 'surface');
export const GlassSheet = themed(Glass.GlassSheet, 'sheet');
export const GlassProgressiveBlur = themed(Glass.GlassProgressiveBlur, 'scrollEdge');
export const GlassScene = themed(Glass.GlassScene);
