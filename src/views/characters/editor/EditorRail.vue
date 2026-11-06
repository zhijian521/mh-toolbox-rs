<script setup lang="ts">
import { computed } from 'vue';
import PressTile from '../../../components/PressTile.vue';
import IconTile from '../IconTile.vue';
import type { RailItem } from './rail';

/**
 * 编辑弹窗里的**左栏目录**：装备与召唤兽共用一套。
 *
 * ---- 为什么抽出来 ----
 * 两页在 2026-11-05 先后改成「左栏目录 + 右侧详情」（装备 E2、召唤兽 P3），
 * 各自抄了一份左栏：`.rail` / `.rail-head` / `.rail-item` / `.rail-item.on` /
 * `.rail-dot` / `.rail-dot.on` 六组选择器**逐字重复**，加起来 220 行。
 * 两份的差别只有三处，都是有意为之的参数（见下面每个 prop 的注释）。
 *
 * 留着两套的代价不是行数，是**它们会漂**：左栏贴不贴顶、选中线多粗、点多大，
 * 这些是同一个弹窗里的两个页签，用户来回切的时候必须一样。改一处忘一处，
 * 表现是「切一下页签左栏就变了个样」，而且没有人会为此报 bug。
 *
 * ---- 2026-11-06 重做：照开发页「原子组件」那套左右结构 ----
 * 用户：「装备和召唤兽编辑页面……可以参考开发帮助原子组件左右结构布局样式，
 * 左边是选择按钮，右边是详情，左右两边的背景样式保持一致」。
 *
 * 于是这一栏从「一条目录 + 一条竖线」变成**一道竖槽**（全局 `.well upright`），
 * 每一行是一枚**浅纸键**（`--well-key` 底 + 四条棱 + 两层影），选中的那一枚由
 * 一枚**独立的朱印**交代——`translateY` 滑过去，行本身不挂背景。
 *
 * 三样东西与开发页那一栏一一对应（那边又对应主侧栏 `AppRail`）：
 *   槽   = `.well upright`（金边 / `--well` 底 / 左壁暗 / 顶影 / 下沿亮边）
 *   键   = `.rail-item`（浅纸，比槽底高一档）
 *   拇指 = 一枚 `.stamp`，只换位置、不换类
 *
 * **为什么印要单独一层**（与开发页同一条理由，那边踩过）：让选中格自己灌朱的话，
 * 「选中的是哪一格」就变成「哪一格挂了 `.stamp` 类」——切换瞬间没有位移，只有一次
 * 闪断；而且还要靠 `:not(.on)` 绕开 scoped 特异性去压全局 `.stamp`。独立拇指把这件事
 * 收回成一处：印在哪，选中的就是哪。
 *
 * ---- 这里不管什么 ----
 * 数据、选中逻辑、「填了没有」的判据全在各页（`filled()` 每条判据都与那个页的
 * 字段语义绑死）。这里只回答「一行长什么样」。
 */
const props = withDefaults(
    defineProps<{
        /** 行首的主语：装备 / 召唤兽。 */
        label: string;
        /** 顶端那个数：已填件数（装备）或总只数（召唤兽）。 */
        count: number;
        /** 数后面接的话：`/ 12` 或 `只`。 */
        suffix: string;
        items: RailItem[];
        /** 当前选中项的 `key`。 */
        selected: string;
        /**
         * 行高。**两页统一 34**（2026-11-06 用户：「两个的左边里面项的大小保持一致」，
         * 此前装备 30、召唤兽 38）。34 是两页都能容下的那个数：装备十二行 =
         * 12 × 34 + 11 × 3 + 头部 ≈ 476，一屏放得下、不用滚；召唤兽只有五六行，
         * 也不至于空成一片。**留成 prop 是为了哪天某一页真需要，但两页现在都不传。**
         */
        rowHeight?: number;
    }>(),
    { rowHeight: 34 },
);

/* 事件名刻意不叫 `select`：组件根是 `<aside>`，而 `select` 是 DOM 的原生事件名，
 * 两者会被合成一个「(payload: Event) => void」的交叉签名，`@select="fn(key: string)"` 当场报错。
 * 换成 `pick` 之后没有歧义，也读得出「挑了一行」这层意思。 */
const emit = defineEmits<{ pick: [key: string]; kill: [key: string] }>();

/** 朱印滑到第几行。找不到（选中项刚被删掉）时回 0，不让印凭空跳到底。 */
const index = computed(() =>
    Math.max(
        0,
        props.items.findIndex((item) => item.key === props.selected),
    ),
);

/** 拇指的位移：一格 = 行高 + 格间。两个都是 CSS 变量，字号变时不用重算。 */
const thumbStyle = computed(() => ({
    transform: `translateY(calc(${index.value} * (var(--rail-h) + var(--rail-gap))))`,
}));
</script>

<template>
    <!-- 左栏是这张表单的目录：从上到下就是固定顺序，高度不变，
         所以「我在改哪一个」由位置回答，不用读标题。
         槽铺满整列（`align-self` 由父级的栅格给），右边那块详情也是同一道槽，
         两栏才读作「同一层架子上的两列」。 -->
    <aside class="rail well upright" :style="{ '--rail-h': `${rowHeight}px` }">
        <div class="rail-head">
            {{ label }} <b>{{ count }}</b
            >{{ suffix }}
        </div>

        <!-- 印单独一层、只换位置：见文件头「为什么印要单独一层」。 -->
        <div class="rail-list">
            <span class="rail-thumb stamp" aria-hidden="true" :style="thumbStyle" />

            <!-- 一行一个 `rail-row`：行本身是按钮，行尾那枚 × 只能放在**兄弟**位置上
                 ——按钮里不能嵌按钮，硬塞会让点 × 的时候连带选中这一行。
                 × 与「填了没有」的圆点占同一个位置：悬停时点让开、换成 ×。 -->
            <div v-for="item in items" :key="item.key" class="rail-row">
                <button
                    type="button"
                    class="rail-item"
                    :class="{ on: item.key === selected }"
                    :aria-pressed="item.key === selected"
                    :aria-label="item.label"
                    @click="emit('pick', item.key)"
                >
                    <IconTile v-if="item.icon" class="rail-pic" :src="item.icon" />
                    <PressTile v-else-if="item.tile" class="rail-pic" still aria-hidden="true">
                        <span class="rail-ini">{{ item.mark }}</span>
                    </PressTile>
                    <span v-else class="rail-mark" aria-hidden="true">{{ item.mark }}</span>
                    <span class="rail-name">{{ item.name }}</span>
                    <span class="rail-dot" :class="{ on: item.filled }" aria-hidden="true"></span>
                </button>

                <button
                    v-if="item.kill"
                    type="button"
                    class="rail-kill"
                    :aria-label="item.kill"
                    :title="item.kill"
                    @click="emit('kill', item.key)"
                >
                    <svg class="rail-x" viewBox="0 0 10 10" aria-hidden="true">
                        <path d="M2 2 L8 8 M8 2 L2 8" />
                    </svg>
                </button>
            </div>
        </div>

        <!-- 「加一只」这类追加动作挂在目录末尾：它是往目录里添一行，
             所以长得像一行，不该跑到别处。 -->
        <slot name="footer" />
    </aside>
</template>

<style scoped>
/* ======================================================================
 * 一道竖槽 + 一排浅纸键 + 一枚会滑的朱印
 *
 * 深度**一行都不写在这里**：凹槽的厚度、浅纸键的底色（`--well-key`）、朱印的
 * 四件套全在 `base.css` 里（`.well.upright` / `.stamp`）。名字滑块、两格开关、
 * 主侧栏、开发页那一栏与这一栏是**同一道槽切成五种形状**。
 * ==================================================================== */
.rail {
    /* 格间 3：主侧栏是 5（格高 62），这里 34 的行高给 5 会读成「一行拆成了两半」。
     * 固定像素、不乘 `--fs-scale`——行高本身也是固定像素，两者一起变会把十二行顶出右栏。
     *
     * `--rail-end`：**行尾那三样东西的中轴到「行右边缘」的距离**（行的坐标系，
     * 也就是 `.rail-row` 的右边缘，不是 `.rail-item` 的）。点、× 与名字的右内边距
     * 全从这一个数推（`calc` 见下面三处），所以「鼠标划过时点让开、× 顶上来」
     * 读作同一个位置换了记号，而不是跳一下。改它一个，三处一起走。
     *
     * 19 是「再往外就贴边、再往里面名字就放不下」的中间值：
     *   · × 的盒子 18 宽，右边缘因此离行边 10（原来只有 2，hover 的红底像被行啃掉）；
     *   · 名字的右内边距 = 19 + 2 = 21（2 是 `.rail-item` 的左右外边距），
     *     1.1 字号档下「天狗（人形）」量下来要 79.2，还剩 1.8 的余量。 */
    --rail-gap: 3px;
    --rail-end: 19px;

    position: relative;
    display: flex;
    flex-direction: column;
    padding: 4px;
    border-radius: var(--r-2);
    /* 两栏各自滚（2026-11-06 用户：「左右部分滚动不联动」）：左栏只在**真放不下**时
     * 滚自己的。`min-height: 0` 不能省——flex / grid 子项的默认最小高度是内容高，
     * 省了它，槽会被十二行撑到比右栏还高，滚动又回到外层去了。 */
    min-height: 0;
    overflow: auto;
}
/* 计数那一行：槽里的一枚小签，底线用 `--rule-2` 的 62%——槽底本来就深一档，
 * 用满值会读成「另一道槽的边」。 */
.rail-head {
    display: flex;
    flex: none;
    align-items: baseline;
    gap: 4px;
    padding: 2px 6px 6px;
    margin-bottom: 2px;
    border-bottom: var(--w-hair) solid color-mix(in srgb, var(--rule-2) 62%, transparent);
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.14em;
}
.rail-head b {
    color: var(--ink);
    font-size: var(--fs-sm);
    font-weight: 400;
}
/* 行的容器：印的定位基准。它自己不进 flex 分配（`flex: none`），
 * 行有多高它就是多高——`overflow: auto` 的滚动范围也只到这里。 */
.rail-list {
    position: relative;
    display: flex;
    flex: none;
    flex-direction: column;
    gap: var(--rail-gap);
}
/* 一行 = 一枚键 + 一枚 ×（× 绝对定位，不吃行的布局）。
 * 为什么要有这一层：<button> 不能嵌 <button>，把 × 塞进行里的合法做法只有
 * 「行不再是按钮」或者「× 是行的兄弟」——选后者，行的整块点击区域一点没变。 */
.rail-row {
    position: relative;
    display: flex;
    flex: none;
    min-width: 0;
}
/* 朱印：左右各缩 2（键有 2 的外边距，印正好盖住键面），高度就是格高。
 * 2px 实底边（`--stamp-depth`）让印「压在槽里」而不是「贴在槽上」，
 * 与主侧栏、开发页那一栏同一条；没有它只剩一道软影，读作红色贴纸。 */
.rail-thumb {
    --stamp-depth: 2px;

    position: absolute;
    top: 0;
    right: 2px;
    left: 2px;
    height: var(--rail-h);
    border-radius: var(--r-2);
    transition: transform var(--t-slide) var(--ease-snap);
    /* 印面不吃指针：否则点在印上时事件目标是它，`data-key` 拿不到，点击会落空。 */
    pointer-events: none;
}
/* 一行 = 22 的盘/章 + 名字 + 一个点，高由 `--rail-h` 给。
 *
 * 未选中是**一枚浅纸键**：底色 `--well-key`、上/左 1px 亮线、右/下两条背光棱、
 * 落地一层硬影一层软影。与主侧栏的格、开发页目录的格是同一颗按钮的三种尺寸。
 * 两条棱不能共用一个值：`--rule-2` 在暗色比块面亮，照用会在底边发光。 */
.rail-item {
    --rail-rim-lo: light-dark(color-mix(in srgb, var(--rule-2) 46%, transparent), var(--bevel-lo));
    --rail-rim-base: light-dark(
        color-mix(in srgb, var(--rule-2) 78%, transparent),
        var(--bevel-lo)
    );

    position: relative;
    z-index: 1;
    display: flex;
    flex: 1;
    align-items: center;
    gap: 8px;
    height: var(--rail-h);
    min-width: 0;
    /* 左右各让 2：与朱印同宽，未选中与选中是一颗按钮的两种状态，不是两种宽度。
     * 右内边距从 `--rail-end` 推（+2 是这层外边距的补偿）：名字的省略号要止在
     * × 那两条线之前——线转 45 度之后横向只占 6.4，名字到 21 时还隔 0.8。 */
    margin: 0 2px;
    padding: 0 calc(var(--rail-end) + 2px) 0 6px;
    border: 0;
    border-radius: var(--r-2);
    background-color: var(--well-key);
    /* 两端半透明叠加：悬停换底色时底下的浅纸才透得上来（与主侧栏同一条）。 */
    background-image:
        radial-gradient(
            120% 92% at 16% -8%,
            color-mix(in srgb, var(--bevel-hi) 62%, transparent),
            transparent 54%
        ),
        linear-gradient(
            135deg,
            light-dark(
                    color-mix(in srgb, var(--paper-base) 9%, transparent),
                    color-mix(in srgb, var(--ink) 4%, transparent)
                )
                0,
            transparent 48%,
            color-mix(in srgb, var(--ink-base) 9%, transparent) 100%
        );
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        inset 1px 0 0 color-mix(in srgb, var(--bevel-hi) 62%, transparent),
        inset -1px 0 0 var(--rail-rim-lo),
        inset 0 -2px 0 var(--rail-rim-base),
        0 1px 0 var(--shadow),
        0 3px 5px -3px var(--shadow-lg);
    color: var(--ink-2);
    font-family: var(--font-ui);
    font-size: var(--fs-sm);
    text-align: left;
    cursor: pointer;
    transition:
        color var(--t-mid) var(--ease-soft),
        background-color var(--t-quick) var(--ease-soft),
        box-shadow var(--t-quick) var(--ease-soft);
}
/* 悬停把这块浅纸压实一档。**四条棱要整套重写**：只写两条会把右、下那两条背光棱
 * 清掉，悬停时块反而没有厚度。 */
.rail-item:hover {
    color: var(--ink);
    background-color: var(--well-key-hover);
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        inset 1px 0 0 color-mix(in srgb, var(--bevel-hi) 78%, transparent),
        inset -1px 0 0 var(--rail-rim-lo),
        inset 0 -2px 0 var(--rail-rim-base),
        0 2px 0 var(--shadow),
        0 4px 7px -4px var(--shadow-lg);
}
/* 选中那格只换字色（`--on-seal`，与印面成对翻），**不加粗、不加描边、不加字距**：
 * 文楷只有 Regular，描边与合成加粗都会把撇捺糊成块；「我在改哪一件」由那枚朱印说完。
 * 悬停时要清底：否则划过选中项时那层浅纸会盖住朱印。 */
.rail-item.on,
.rail-item.on:hover {
    color: var(--on-seal);
    background: none;
    box-shadow: none;
}
/* 聚焦环不能用朱红：选中时底就是朱红，红环会消失（`--ring-inv`，与开发页目录、
 * 主侧栏的格同一条规矩）。负 offset 收进印面里，免得在槽上向外撑出一圈。 */
.rail-item:focus-visible {
    outline: var(--ring-inv);
    outline-offset: -2px;
}
/* 22 的小盘。选择器带 `.rail-item` 是为了压过 `IconTile` 自己那套 28 / 23 的默认值
 * ——两边都是单类 + 一个 `data-v`，只差这句多带一层父选择器。 */
.rail-item .rail-pic {
    --tile-w: 22px;
    --tile-h: 22px;
    --tile-r: var(--r-1);
    --shot: 18px;
    --tile-drop: 0.35;
    --tile-face: light-dark(var(--paper), color-mix(in srgb, var(--paper-2) 84%, var(--ink)));
}
.rail-ini {
    color: color-mix(in srgb, var(--ink-2) 78%, transparent);
    font-size: calc(12px * var(--fs-scale));
    line-height: 1;
}
/* 五行章：与详情窗抬头那枚（34）同一套压印，缩到 22——左栏是索引，
 * 认的是「哪只」，不是读五行。 */
.rail-mark {
    display: grid;
    flex: none;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: var(--r-1);
    background: color-mix(in srgb, var(--well) 34%, var(--paper-2));
    box-shadow:
        inset 1px 1px 0 var(--bevel-hi),
        inset -1px -1px 0 var(--bevel-lo),
        0 1px 2px var(--shadow);
    color: var(--num);
    font-size: calc(var(--fs-sm) + 2px);
    line-height: 1;
}
.rail-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
/* 点：实心＝填了，空心＝还没填。`--moss` 与「成功＝正收益」同一枚绿，
 * 这里表示「这件有了」——不新开一个色。选中格的底是朱红，绿点压在上面读不出，
 * 所以那一格换成印面的墨色（`--on-seal`）。
 *
 * **绝对定位**（2026-11-06）：它和行尾那枚 × 占同一个位置——悬停时点让开、换 ×，
 * 否则两者并排，行宽又要多抠 20px 出来。中轴由 `--rail-end` 给，
 * 与 × 严格同轴：2 是 `--rail-item` 的左右外边距，2.5 是点自己的半径。 */
.rail-dot {
    position: absolute;
    top: 50%;
    right: calc(var(--rail-end) - 2px - 2.5px);
    width: 5px;
    height: 5px;
    transform: translateY(-50%);
    border: var(--w-hair) solid color-mix(in srgb, var(--rule-2) 90%, transparent);
    border-radius: 50%;
    transition: opacity var(--t-quick) var(--ease-soft);
}
.rail-dot.on {
    border-color: var(--moss);
    background: var(--moss);
}
.rail-item.on .rail-dot {
    border-color: color-mix(in srgb, var(--on-seal) 58%, transparent);
}
.rail-item.on .rail-dot.on {
    border-color: var(--on-seal);
    background: var(--on-seal);
}
/* ---------- 行尾那枚 × ----------
 * **悬停才现身**，位置正好接住让开的点（中轴都是 `--rail-end`，见 `.rail`）。
 *
 * 为什么不常驻：十二行、每行一枚 ×，左栏会读成一排「删除按钮」，而它平时是目录。
 * `opacity: 0` 而不是 `display: none`——后者会让键盘走不到它，而删掉一只召唤兽
 * 不该只有鼠标能做。
 *
 * ---- 2026-11-06 修了四个毛病 ----（用户：「位置贴边、hover 时会跳，X 没有在按钮
 * 最中间，选中装备/宝宝的删除按钮看不清」）
 *
 *   ① **贴边**：原来盒子 16 宽、`right: 4`（行的坐标系），右边缘离行边只剩 2px，
 *      读作被行啃掉一块。现在 18 宽、中轴恒在 `--rail-end`（19），右边留到 10。
 *   ② **跳**：原来点距行边 12.5、× 距行边 12，一个 5px 一个 16px，划过时像挪了位置。
 *      现在两者中轴都是 `--rail-end`，名字的右内边距也从它推，三样一条线。
 *   ③ **不居中**：`×` 用的是文楷里的乘号，字形按数学轴排，`place-items: center`
 *      只居中了盒子，字形本身偏上。**所以干脆不用字符也不用伪元素**——
 *      模板里一枚内联 SVG，两条线从 (2,2) 到 (8,8)，位置由几何中心说了算，
 *      两个主题、两档字号都一样正。用伪元素那版还踩了一个坑：HMR 只换样式不换模板时，
 *      旧模板里的 `×` 字符会和新画的两条线同时存在，hover 起来是**两个叉**。
 *   ④ **看不清**：选中行是朱底，原来把颜色压到 `--on-seal` 的 66% 透明，等于没画。
 *      现在满值，悬停再加一层实底。未选中行也从 `--muted` 提到 `--ink-2`
 *      （它是个动作，不该和「部位名」那种说明字一样淡）。
 */
.rail-kill {
    position: absolute;
    top: 50%;
    right: calc(var(--rail-end) - 9px);
    /* 行本身是 `z-index: 1`（要盖住朱印），× 得再高一层，否则被行面吞掉。 */
    z-index: 2;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    transform: translateY(-50%);
    border: 0;
    border-radius: var(--r-1);
    background: none;
    color: var(--ink-2);
    cursor: pointer;
    opacity: 0;
    transition:
        opacity var(--t-quick) var(--ease-soft),
        color var(--t-quick) var(--ease-soft),
        background-color var(--t-quick) var(--ease-soft);
}
/* 两条对角线。`stroke: currentColor` 让颜色继续由按钮管（两个主题、选中与否
 * 都只有一处定义）；`stroke-width` 是 viewBox 单位，10 缩到 9 之后约 1.4px。 */
.rail-x {
    display: block;
    width: 10px;
    height: 10px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
}
.rail-row:hover .rail-kill,
.rail-kill:focus-visible {
    opacity: 1;
}
/* 悬停时点让开：两者叠在同一个位置，不藏会读成「朱点旁边还有个叉」。 */
.rail-row:hover .rail-dot {
    opacity: 0;
}
.rail-kill:hover {
    background: color-mix(in srgb, var(--cinnabar) 14%, transparent);
    color: var(--cinnabar);
}
/* 选中行是朱底：× 用印面的墨色，悬停再压一层更实的白，朱红底上画朱红看不见。 */
.rail-item.on + .rail-kill {
    color: var(--on-seal);
}
.rail-item.on + .rail-kill:hover {
    background: color-mix(in srgb, var(--on-seal) 22%, transparent);
    color: var(--on-seal);
}
.rail-kill:focus-visible {
    outline: var(--ring);
    outline-offset: -2px;
}
</style>
