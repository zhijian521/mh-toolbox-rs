<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useFontScale } from '../../composables/use-font-scale';
import { useTheme } from '../../composables/use-theme';
import type { GhostPlan } from '../../services/ghost-model';
import { paintMap, resolveColors, type Layout } from './map-paint';

/**
 * 地图底图 + 范围框。
 *
 * 用 Canvas 而不是 DOM 叠层：范围框的边必须与底图**像素级**对齐，而底图尺寸各异
 * （从 214×426 到 960×182），用绝对定位的 div 按百分比摆，边缘会因为各层取整规则
 * 不同差半个像素，框线看起来像「浮在地图上面」而不是「画在地图上」。
 *
 * 这个组件只管**什么时候画**：尺寸变了、主题变了、换图了、字号变了。画出来什么
 * 全在 `./map-paint`——那一层不碰 Vue，四种模式各管一段，加模式不必读懂另外三个。
 * 早先两者混在一个 320 行的 `draw()` 里。
 */

const props = defineProps<{ plan: GhostPlan | null }>();

const stage = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const image = shallowRef<HTMLImageElement | null>(null);
const loading = ref(false);

const { isDark } = useTheme();
// 字号改一档要重画：canvas 里的字不走 CSS，`--fs-scale` 变了它不会自己跟上。
const { scale } = useFontScale();

const currentMap = computed(() => props.plan?.map ?? null);

function draw() {
    const element = canvas.value;
    const host = stage.value;
    if (!element || !host) return;

    const cssWidth = host.clientWidth;
    const cssHeight = host.clientHeight;
    if (cssWidth <= 0 || cssHeight <= 0) return;

    // 上限 2：4K 屏上 devicePixelRatio 可能是 3，画布面积翻九倍，
    // 而这里是几百像素的线框图，2 倍已经看不出锯齿。
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(cssWidth * dpr);
    const pixelHeight = Math.round(cssHeight * dpr);
    // 只在尺寸真的变了才赋值：给 `canvas.width` 赋值会重建后备缓冲（旧内容与
    // 上下文状态一起清空），而这里每帧都会重画一次，尺寸却几乎从不改变——
    // 无条件赋值等于每帧白白重建一次。
    if (element.width !== pixelWidth || element.height !== pixelHeight) {
        element.width = pixelWidth;
        element.height = pixelHeight;
        element.style.width = `${cssWidth}px`;
        element.style.height = `${cssHeight}px`;
    }

    const ctx = element.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const plan = props.plan;
    const bitmap = image.value;
    if (!plan || !plan.map || !bitmap || !bitmap.naturalWidth) return;

    // contain 而不是 cover：地图必须整幅可见，裁掉一角就等于把鬼可能出现的地方藏起来。
    // 水平靠左、垂直居中：页面上方那行标题也是左对齐的，图跟着贴左就与它同一条竖线；
    // 水平居中会让标题与图各在各的位置上，中间空一大片。
    const fit = Math.min(cssWidth / bitmap.naturalWidth, cssHeight / bitmap.naturalHeight);
    const layout: Layout = {
        left: 0,
        top: (cssHeight - bitmap.naturalHeight * fit) / 2,
        width: bitmap.naturalWidth * fit,
        height: bitmap.naturalHeight * fit,
    };

    paintMap(ctx, {
        plan,
        layout,
        bitmap,
        colors: resolveColors(isDark.value),
        dark: isDark.value,
    });
}

let observer: ResizeObserver | null = null;

function scheduleDraw() {
    // 合并同一帧里的多次触发：ResizeObserver 在布局抖动时会连续回调。
    requestAnimationFrame(draw);
}

watch(
    () => currentMap.value?.img ?? null,
    async (src) => {
        if (!src) {
            image.value = null;
            scheduleDraw();
            return;
        }
        loading.value = true;
        const bitmap = new Image();
        bitmap.src = src;
        try {
            await bitmap.decode();
        } catch {
            // 解码失败就当没有底图，交给空状态处理，不抛——抛了页面会白掉。
            loading.value = false;
            return;
        }
        // 期间用户可能已经切到别的任务，别用旧图覆盖新图。
        if (currentMap.value?.img === src) {
            image.value = bitmap;
            loading.value = false;
            scheduleDraw();
        }
    },
    { immediate: true },
);

watch([() => props.plan, isDark, scale], scheduleDraw, { deep: false });

onMounted(() => {
    const host = stage.value;
    if (host && typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(scheduleDraw);
        observer.observe(host);
    }
    // canvas 里画的是自定义字体，字体没加载完就画会用回退字形，宽度也算错。
    void document.fonts.ready.then(scheduleDraw);
    scheduleDraw();
});

onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
});
</script>

<template>
    <div ref="stage" class="map-stage">
        <canvas ref="canvas" class="map-canvas" />
        <p v-if="!plan" class="map-hint">还没有读到任务</p>
        <!-- 识别失败时底图还在，提示要压在图上，所以给一块实底：
             只靠文字阴影，在写实地形上基本读不出来。 -->
        <div v-else-if="plan.mode === 'invalid'" class="map-alert">
            <span>{{ plan.reason }}</span>
        </div>
        <p v-else-if="loading && !image" class="map-hint">底图加载中</p>
        <p v-else-if="!image" class="map-hint">底图没加载上</p>
    </div>
</template>

<style scoped>
.map-stage {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 240px;
    /* 不画边框：外层 `.frame` 自带文武线，这里再描一圈就成了双线。
     * 也不垫底色：地图本身是彩色图，再套一圈深色就成了「相框里的照片」，
     * 而这里要读成「印在这张纸上」。 */
    background: transparent;
    overflow: hidden;
}
.map-canvas {
    display: block;
}
.map-hint {
    position: absolute;
    inset: 0;
    display: grid;
    margin: 0;
    padding: 0 24px;
    place-items: center;
    color: var(--muted);
    font-size: var(--fs-sm);
    pointer-events: none;
}
.map-alert {
    position: absolute;
    inset: 0;
    display: grid;
    padding: 0 24px;
    place-items: center;
    pointer-events: none;
}
.map-alert span {
    max-width: 330px;
    padding: 7px 11px;
    border: var(--w-hair) solid var(--ochre);
    background: var(--paper);
    color: var(--ink);
    font-size: var(--fs-sm);
    line-height: 1.65;
    text-align: center;
}
</style>
