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

    const FONT = '12px "LXGW WenKai Screen", "Microsoft YaHei", sans-serif';
    /* 三个标签共用同一套字号与内边距：坐标、官方格数、收窄比例是一类东西，
     * 大小不一会被读成「重要性不同」，而它们只是三个不同来源的数字。 */
    const PAD_X = 4;
    const PAD_Y = 3;
    const BOX_H = 18;

    interface LabelBox {
        x: number;
        y: number;
        w: number;
        h: number;
    }

    /** 已经占住的标签矩形。 */
    const placed: LabelBox[] = [];
    const collides = (a: LabelBox) =>
        placed.some(
            (b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h,
        );

    /**
     * 落一个标签并占位。
     *
     * 图上最多三个标签，各有各的锚点，在「假坐标贴边」这类位置上会撞在一起：
     * 十字贴着框的上边缘、它的数字又只能往左翻，正好压在「最可能 · 收窄 N%」上，
     * 两个数字都读不全。撞了就上下让一格——挪 20px 仍读得成「属于这个框的标签」，
     * 互相盖住则两个都废掉。
     *
     * 顺带夹进地图矩形：框可能贴到图的最上沿或最右沿，标签按原样画会落到留白上，
     * 变成「飘着的一行字」，看不出它属于哪个框。
     */
    const placeLabel = (
        text: string,
        x: number,
        y: number,
        w: number,
        color: string,
        border: boolean,
    ) => {
        const clampY = (top: number) =>
            Math.min(Math.max(top, layout.top + 2), layout.top + layout.height - BOX_H - 2);
        const box: LabelBox = {
            x: Math.min(Math.max(x, layout.left + 2), layout.left + layout.width - w - 2),
            y: clampY(y),
            w,
            h: BOX_H,
        };
        const baseY = box.y;
        for (const shift of [0, -20, 20, -40, 40]) {
            box.y = clampY(baseY + shift);
            if (!collides(box)) break;
        }
        placed.push({ ...box });

        ctx.save();
        ctx.font = FONT;
        // 标签底：地图本身颜色杂，纯文字在任何位置都可能与地形撞色。
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = paper;
        ctx.fillRect(box.x, box.y, box.w, BOX_H);
        ctx.restore();

        if (border) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, BOX_H - 1);
        }
        ctx.fillStyle = color;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText(text, box.x + PAD_X, box.y + PAD_Y);
    };

    /** 带边框的说明标签：给一个锚点，自己量宽、自己找位置。 */
    const label = (text: string, x: number, y: number, color: string, align: 'left' | 'right') => {
        ctx.font = FONT;
        const w = ctx.measureText(text).width + PAD_X * 2;
        placeLabel(text, align === 'left' ? x : x - w, y - 12 - PAD_Y, w, color, true);
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
        const rawX = plan.mode === 'range' ? plan.range.x.value : plan.x;
        const rawY = plan.mode === 'range' ? plan.range.y.value : plan.y;
        // 假坐标可以落在值域外：游戏按真实位置 ±50 随机，不按地图边界裁剪，
        // 所以真身贴边时提示坐标本身就越界（普陀山 96×72 读到 100,66）。
        // 按**贴边**画，并在数字后面标「图外」——画在边缘说的是「就在那条边上」，
        // 而丢掉这条任务或把标记画到图上外面，都是在丢信息。
        const outside = rawX > map.maxX || rawY > map.maxY;
        const { px, py } = project(
            layout,
            map,
            Math.min(Math.max(rawX, 0), map.maxX),
            Math.min(Math.max(rawY, 0), map.maxY),
        );
        const size = plan.mode === 'exact' ? 11 : 7;

        // 裁到地图矩形：贴边时十字的两臂与那圈圆会有半个露在地图外，浮在纸面上
        // 读起来像一枚不相干的符号；裁掉之后半个符号正好读成「压在边界上」。
        ctx.save();
        ctx.beginPath();
        ctx.rect(layout.left, layout.top, layout.width, layout.height);
        ctx.clip();

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

        const text = outside ? `${rawX},${rawY} 图外` : `${rawX},${rawY}`;
        ctx.font = FONT;
        const boxWidth = ctx.measureText(text).width + PAD_X * 2;
        const gap = size + 3;
        // 数字默认写在十字右侧；贴到右边缘时右侧已经没地方，翻到左侧。
        // 不翻就会被裁在地图外，剩一个十字什么信息都没有。
        const fitsRight = px + gap + boxWidth <= layout.left + layout.width - 2;
        placeLabel(
            text,
            fitsRight ? px + gap : px - gap - boxWidth,
            py - BOX_H / 2,
            boxWidth,
            ink,
            false,
        );

        ctx.restore();
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
