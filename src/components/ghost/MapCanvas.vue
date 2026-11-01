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
    mapSeal: string;
    mapSealInk: string;
    mapHalo: string;
    wash: string;
    washEdge: string;
    hot: string;
    hotEdge: string;
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
        mapSeal: read('--map-seal'),
        mapSealInk: read('--map-seal-ink'),
        mapHalo: read('--map-halo'),
        wash: read('--ghost-wash'),
        washEdge: read('--ghost-wash-edge'),
        hot: read('--ghost-hot'),
        hotEdge: read('--ghost-hot-edge'),
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

    const { cinnabar, mapSeal, mapSealInk, mapHalo, wash, washEdge, hot, hotEdge, paper, ink } =
        colors;

    const FONT = '12px "LXGW WenKai Screen", "Microsoft YaHei", sans-serif';
    /* 开眼时的坐标比标签大一档：它是这一屏唯一要照着走的数字，而且写在地形上、
     * 没有底板托着，小一号就压不住背景的杂色。 */
    const FONT_EXACT = '13.5px "LXGW WenKai Screen", "Microsoft YaHei", sans-serif';
    /* 剩下的文字标签只有两类：坐标与「整层」那句。大小统一，读起来才是同一层信息。 */
    const PAD_X = 4;
    const PAD_Y = 3;
    const BOX_H = 18;

    interface LabelBox {
        x: number;
        y: number;
        w: number;
        h: number;
    }

    /**
     * 落一个标签。
     *
     * 每个 plan 上最多一个标签（坐标，或「整层」那句话），所以不需要避让逻辑——
     * 早先范围框自带两枚说明文字时才需要。留着的只有「夹进地图矩形」这一步：
     * 坐标可以贴到图的最上沿或最右沿，标签按原样画会落到留白上，变成飘着的一行字。
     */
    const placeLabel = (
        text: string,
        x: number,
        y: number,
        w: number,
        color: string,
        border: boolean,
    ) => {
        const box: LabelBox = {
            x: Math.min(Math.max(x, layout.left + 2), layout.left + layout.width - w - 2),
            y: Math.min(Math.max(y, layout.top + 2), layout.top + layout.height - BOX_H - 2),
            w,
            h: BOX_H,
        };

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

        /**
         * 半透明铺块。
         *
         * 不铺实色：这张图上真正用来缩小范围的是地形（洞口、通道、水陆分界），
         * 盖死等于把唯一的线索抹掉。原先给到 0.62 / 0.70，看着「有块红」，代价是
         * 整片地形只剩一团糊——而玩家要做的恰恰是照着地形走过去，范围只是入口。
         * 现在压到 0.24 / 0.42：**范围的边界交给 `edge` 的 2px 线，填充只表示
         * 「这一片」，不承担识别**。两层仍靠明度差区分，alpha 逐块控制。
         */
        const tint = (x: number, y: number, w: number, h: number, color: string, alpha: number) => {
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
            ctx.fillRect(x, y, w, h);
            ctx.restore();
        };

        /**
         * 2px 实线边框。
         *
         * 填充压到两成出头之后，**这一圈线就是范围唯一的凭据**，所以从 1px 加到 2px：
         * 1px 在写实地形上会被树丛、山棱的线条吃掉，读起来像地图自带的一格。
         *
         * 两层都用实线、靠**颜色深浅**区分，不靠线型：虚线会与树丛、小路的纹理打架。
         */
        const edge = (x: number, y: number, w: number, h: number, color: string) => {
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            // 2px 线沿着 0.5 偏移会糊到两个像素各一半，偏移 1 才是内外各占 1px 的实线。
            ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
            ctx.restore();
        };

        // 官方 ±50：浅红底。这是「规则给的」那一层，只负责「这一片有鬼」。
        tint(topLeft.px, topLeft.py, width, height, wash, isDark.value ? 0.3 : 0.24);
        edge(topLeft.px, topLeft.py, width, height, washEdge);

        if (likely) {
            const innerTop = project(layout, map, likely.x0, likely.y1);
            const innerBottom = project(layout, map, likely.x1, likely.y0);
            const innerWidth = innerBottom.px - innerTop.px;
            const innerHeight = innerBottom.py - innerTop.py;

            // 高概率区域：深红底。比浅红浓一倍，压在浅红里能读成「同一块地里的内芯」，
            // 而不是另一个不相干的框。
            tint(
                innerTop.px,
                innerTop.py,
                innerWidth,
                innerHeight,
                hot,
                isDark.value ? 0.48 : 0.42,
            );
            edge(innerTop.px, innerTop.py, innerWidth, innerHeight, hotEdge);
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

        // 裁到地图矩形：贴边时标记会有半个露在地图外，浮在纸面上读起来像一枚
        // 不相干的符号；裁掉之后半个符号正好读成「压在边界上」。
        ctx.save();
        ctx.beginPath();
        ctx.rect(layout.left, layout.top, layout.width, layout.height);
        ctx.clip();

        const text = outside ? `${rawX},${rawY} 图外` : `${rawX},${rawY}`;

        if (plan.mode === 'exact') {
            // 开眼之后任务栏给的是**真坐标**，没有范围可猜，所以这里不画任何框。
            //
            // 中心一枚朱红点、外面一圈纸白细环：环不是装饰，是为了在任何底色上
            // 都能读出点的边界——没有环，点会与深色的山地、水面融成一片。
            ctx.fillStyle = mapSeal;
            ctx.beginPath();
            ctx.arc(px, py, 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = mapHalo;
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.arc(px, py, 5.1, 0, Math.PI * 2);
            ctx.stroke();

            // 坐标是**写在地形上的**，没有底板、没有边框。范围模式那一层用纸色标签，
            // 因为它是一块「区域」，需要一个边界；这里是「一个点」，再套一个框
            // 就成了界面控件贴在地图上，与纸墨这一层语言不搭。
            //
            // 可读性靠纸白描边：写实地形从雪白到近黑都有，单靠朱色压不住。
            ctx.font = FONT_EXACT;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.lineJoin = 'round';
            const textWidth = ctx.measureText(text).width;
            const gap = 11;
            // 默认写在点的右侧；贴到右边缘时翻到左侧。不翻会被裁在地图外，
            // 剩一个点什么信息都没有。
            const fitsRight = px + gap + textWidth <= layout.left + layout.width - 2;
            const textX = fitsRight ? px + gap : px - gap - textWidth;
            // 与点同高才读得出「这串数字属于这个点」，所以只能夹到不出图，
            // 不能像标签那样整体挪走。
            const textY = Math.min(Math.max(py, layout.top + 8), layout.top + layout.height - 8);

            // 先描边再填字。`strokeText` 的 lineWidth 骑在字形轮廓上、内外各一半，
            // 随后填字会把朝内那一半盖掉，净剩向外的 1px；反过来先填后描会
            // 把笔画本身吃细，小字号下直接糊。楷体在 13.5px 上笔画只有一像素宽，
            // 描边再粗一档，字口就被白色吃掉了（实测 1.2px 时「4」几乎读不出缺口）。
            ctx.strokeStyle = mapHalo;
            ctx.lineWidth = 2;
            ctx.strokeText(text, textX, textY);
            ctx.fillStyle = mapSealInk;
            ctx.fillText(text, textX, textY);
        } else {
            const size = 7;
            ctx.strokeStyle = ink;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px - size, py);
            ctx.lineTo(px + size, py);
            ctx.moveTo(px, py - size);
            ctx.lineTo(px, py + size);
            ctx.stroke();

            ctx.fillStyle = paper;
            ctx.strokeStyle = ink;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.font = FONT;
            const boxWidth = ctx.measureText(text).width + PAD_X * 2;
            const gap = size + 3;
            const fitsRight = px + gap + boxWidth <= layout.left + layout.width - 2;
            placeLabel(
                text,
                fitsRight ? px + gap : px - gap - boxWidth,
                py - BOX_H / 2,
                boxWidth,
                ink,
                false,
            );
        }

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
