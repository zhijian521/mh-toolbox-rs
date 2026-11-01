<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { GhostPlan } from '../../services/ghost-model';
import { useTheme } from '../../composables/use-theme';

/**
 * 地图底图 + 范围框。
 *
 * 用 Canvas 而不是 DOM 叠层：范围框的边必须与底图**像素级**对齐，而底图尺寸各异
 * （从 214×426 到 960×182），用绝对定位的 div 按百分比摆，边缘会因为各层取整规则
 * 不同差半个像素，框线看起来像「浮在地图上面」而不是「画在地图上」。
 *
 * 所有几何都在这里按**画布尺寸**重算，不复用 `ghost-model` 的像素结果——
 * 后者按底图原始尺寸算，而画布是等比缩放的，直接套会错位。
 * 唯一共用的是「坐标 → 比例」这一步，式子完全相同。
 */

const props = defineProps<{ plan: GhostPlan | null }>();

const stage = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const image = shallowRef<HTMLImageElement | null>(null);
const loading = ref(false);

const { isDark } = useTheme();

const currentMap = computed(() => props.plan?.map ?? null);

/** 底图坐标 → 画布坐标。`draw` 每次都会把这一份塞进去，避免每个调用点重复算。 */
interface Layout {
    left: number;
    top: number;
    width: number;
    height: number;
}

function project(layout: Layout, map: { maxX: number; maxY: number }, x: number, y: number) {
    return {
        px: layout.left + (x / map.maxX) * layout.width,
        // y 轴翻转：坐标系原点在左下角，画布原点在左上角。
        py: layout.top + layout.height - (y / map.maxY) * layout.height,
    };
}

/**
 * 把 CSS 变量解析成 canvas 能用的颜色。
 *
 * **不能直接 `getPropertyValue('--cinnabar')`**：`tokens.css` 里这些变量的值是
 * `light-dark(#a8322b, #d0755f)`，而 `getPropertyValue` 返回的是**原始 token 序列**，
 * 不做函数求值。把它塞给 `ctx.strokeStyle` 是个非法颜色，canvas 会**静默忽略**
 * ——保持上一次的样式，于是所有框线都画成了默认黑。这个坑很阴：不报错，只是颜色不对。
 *
 * 所以借一个不可见的探针元素：把变量当 `color` 用一次，浏览器才会真的求值
 * （`light-dark()` 依赖元素继承到的 `color-scheme`），再从 computed style 读回 `rgb()`。
 * 结果按主题缓存：主题一变，四个颜色全变，缓存整个作废。
 */
let colorCache: { key: string; colors: MapColors } | null = null;

interface MapColors {
    cinnabar: string;
    indigo: string;
    paper: string;
    ink: string;
    rule: string;
}

function resolveColors(dark: boolean): MapColors {
    const key = dark ? 'dark' : 'light';
    if (colorCache?.key === key) return colorCache.colors;

    const probe = document.createElement('span');
    probe.style.display = 'none';
    document.body.append(probe);
    const read = (name: string): string => {
        probe.style.color = `var(${name})`;
        return getComputedStyle(probe).color;
    };
    const colors: MapColors = {
        cinnabar: read('--cinnabar'),
        indigo: read('--indigo'),
        paper: read('--paper'),
        ink: read('--ink'),
        rule: read('--rule-2'),
    };
    probe.remove();

    colorCache = { key, colors };
    return colors;
}

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

    const colors = resolveColors(isDark.value);

    const plan = props.plan;
    const bitmap = image.value;
    if (!plan || !plan.map || !bitmap || !bitmap.naturalWidth) return;

    const map = plan.map;
    // contain 而不是 cover：地图必须整幅可见，裁掉一角就等于把鬼可能出现的地方藏起来。
    // 水平靠左、垂直居中：页面上方那行标题也是左对齐的，图跟着贴左就与它同一条竖线；
    // 水平居中会让标题与图各在各的位置上，中间空一大片。
    const scale = Math.min(cssWidth / bitmap.naturalWidth, cssHeight / bitmap.naturalHeight);
    const layout: Layout = {
        left: 0,
        top: (cssHeight - bitmap.naturalHeight * scale) / 2,
        width: bitmap.naturalWidth * scale,
        height: bitmap.naturalHeight * scale,
    };

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, layout.left, layout.top, layout.width, layout.height);

    // 底图外面那圈是自己加的底：地图边缘是深色地形，与同样深的面板看不出边界。
    ctx.strokeStyle = colors.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(layout.left + 0.5, layout.top + 0.5, layout.width - 1, layout.height - 1);

    // 画不出来时把地形留着、框全部不画：空白比「一张能看但没有标记的地图」更没用，
    // 而一个位置错误的框比两者都糟。原因由模板里的覆盖文字说明。
    if (plan.mode === 'invalid') return;

    const { cinnabar, indigo, paper, ink } = colors;

    const label = (text: string, x: number, y: number, color: string, align: 'left' | 'right') => {
        ctx.font = '12px "LXGW WenKai Screen", "Microsoft YaHei", sans-serif';
        const width = ctx.measureText(text).width;
        const padX = 4;
        const padY = 3;
        const boxX = align === 'left' ? x : x - width - padX * 2;
        const boxWidth = width + padX * 2;
        // 夹在地图范围内：范围框可能贴到图的最上沿或最右沿，标签按原样画会跑到图外面，
        // 落在留白上就成了「飘着的一行字」，看不出它属于哪个框。
        const boxY = Math.min(
            Math.max(y - 12 - padY, layout.top + 2),
            layout.top + layout.height - 20,
        );
        const boxXClamped = Math.min(
            Math.max(boxX, layout.left + 2),
            layout.left + layout.width - boxWidth - 2,
        );

        // 标签底：地图本身颜色杂，纯文字在任何位置都可能与地形撞色。
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = paper;
        ctx.fillRect(boxXClamped, boxY, boxWidth, 12 + padY * 2);
        ctx.restore();

        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(boxXClamped + 0.5, boxY + 0.5, boxWidth - 1, 12 + padY * 2 - 1);
        ctx.fillStyle = color;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText(text, boxXClamped + padX, boxY + padY);
    };

    if (plan.mode === 'range') {
        const { official, likely } = plan.range;
        const topLeft = project(layout, map, official.x0, official.y1);
        const bottomRight = project(layout, map, official.x1, official.y0);
        const width = bottomRight.px - topLeft.px;
        const height = bottomRight.py - topLeft.py;

        // 官方范围：靛色虚线 + 极淡填充。虚线表示「这是规则给的，不是算出来的边界」。
        ctx.save();
        ctx.globalAlpha = isDark.value ? 0.16 : 0.12;
        ctx.fillStyle = indigo;
        ctx.fillRect(topLeft.px, topLeft.py, width, height);
        ctx.restore();

        // 先铺一道浅色实线当衬底，再画靛色虚线。
        // 底图是写实的深绿深蓝地形，靛色细线直接画上去几乎看不见——
        // 这不是配色问题，是「读不读得到」的问题。朱红框不用衬底：红在绿上本来就很跳。
        //
        // 衬底用**固定的浅色**而不是 `--paper`：纸色跟着主题翻面，暗色下成了近黑，
        // 衬进去反而把线压得更糊。它要对抗的是地形，不是一个会变的主题色。
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
        ctx.lineWidth = 3.5;
        ctx.strokeRect(topLeft.px, topLeft.py, width, height);
        ctx.restore();

        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = indigo;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(topLeft.px, topLeft.py, width, height);
        ctx.restore();

        // 外框标签压到框内左下角。两个框常常共用同一条上边（某轴没被收窄时），
        // 都放顶部必然叠在一起，而叠掉的恰好是「收窄多少」这个最该看见的数字。
        label(
            `官方 ±50 · ${plan.range.officialCells} 格`,
            topLeft.px + 3,
            bottomRight.py - 3,
            indigo,
            'left',
        );

        if (likely) {
            const innerTop = project(layout, map, likely.x0, likely.y1);
            const innerBottom = project(layout, map, likely.x1, likely.y0);
            const innerWidth = innerBottom.px - innerTop.px;
            const innerHeight = innerBottom.py - innerTop.py;

            // 最可能区域：朱红实线 + 更浓的填充。这是整个界面上唯一的红，最该抢眼。
            ctx.save();
            ctx.globalAlpha = isDark.value ? 0.3 : 0.22;
            ctx.fillStyle = cinnabar;
            ctx.fillRect(innerTop.px, innerTop.py, innerWidth, innerHeight);
            ctx.restore();

            ctx.strokeStyle = cinnabar;
            ctx.lineWidth = 2;
            ctx.strokeRect(innerTop.px, innerTop.py, innerWidth, innerHeight);

            const cut = Math.round((1 - plan.range.likelyCells / plan.range.officialCells) * 100);
            const text = `最可能 · 收窄 ${cut}%`;
            // 内框窄到放不下字时贴到框外面，否则字会压在框线上。
            const textWidth = (() => {
                ctx.font = '12px "LXGW WenKai Screen", "Microsoft YaHei", sans-serif';
                return ctx.measureText(text).width + 8;
            })();
            if (innerWidth > textWidth + 6 && innerHeight > 24) {
                // 框里放得下就写在框内顶部（y 是文字底边，+18 让标签底落在框内 3px 处）。
                label(text, innerTop.px + 3, innerTop.py + 18, cinnabar, 'left');
            } else {
                // 放不下就从右边界向左延伸：往右伸会冲出地图，往左伸只是压在图上，
                // 信息的可读性一样，但不会出画。
                label(text, innerBottom.px - 2, innerTop.py - 2, cinnabar, 'right');
            }
        }
    }

    if (plan.mode === 'whole') {
        // 没有坐标域：整层都是候选。
        //
        // 不铺满色。铺满会盖住地形，而这张图恰恰是全程唯一没有别的收敛手段的一张，
        // 图上的地形（洞口、通道、水陆分界）就是用户唯一能用来缩小范围的东西。
        // 改成「只描边 + 一句话」：边说明「范围是整幅」，话说明「为什么只能这样」。
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
        ctx.lineWidth = 4;
        ctx.strokeRect(layout.left + 2, layout.top + 2, layout.width - 4, layout.height - 4);
        ctx.restore();

        ctx.save();
        ctx.setLineDash([7, 5]);
        ctx.strokeStyle = cinnabar;
        ctx.lineWidth = 2;
        ctx.strokeRect(layout.left + 2, layout.top + 2, layout.width - 4, layout.height - 4);
        ctx.restore();

        label(
            '整层都要找 · 没有坐标域',
            layout.left + layout.width - 5,
            layout.top + layout.height - 30,
            cinnabar,
            'right',
        );
    }

    if (plan.mode === 'range' || plan.mode === 'exact') {
        const x = plan.mode === 'range' ? plan.range.x.value : plan.x;
        const y = plan.mode === 'range' ? plan.range.y.value : plan.y;
        const { px, py } = project(layout, map, x, y);
        const size = plan.mode === 'exact' ? 11 : 7;

        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px - size, py);
        ctx.lineTo(px + size, py);
        ctx.moveTo(px, py - size);
        ctx.lineTo(px, py + size);
        ctx.stroke();

        if (plan.mode === 'exact') {
            // 精确点：外面再套一圈，读作「就在这里」，与「大致范围」区分开。
            ctx.strokeStyle = cinnabar;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(px, py, 10, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            ctx.fillStyle = paper;
            ctx.strokeStyle = ink;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        const text = `${x},${y}`;
        ctx.font = '12px "LXGW WenKai Screen", "Microsoft YaHei", sans-serif';
        const textWidth = ctx.measureText(text).width;
        ctx.fillStyle = paper;
        ctx.globalAlpha = 0.88;
        ctx.fillRect(px + size + 3, py - 7, textWidth + 6, 15);
        ctx.globalAlpha = 1;
        ctx.fillStyle = ink;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(text, px + size + 6, py);
    }
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

watch([() => props.plan, isDark], scheduleDraw, { deep: false });

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
