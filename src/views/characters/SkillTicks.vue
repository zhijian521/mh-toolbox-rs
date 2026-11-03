<script setup lang="ts">
/**
 * 九格刻度：一格二十级，练到哪格画到哪格。
 *
 * 这份材质原先在卡与编辑弹窗各写一遍（`character-card.css` 的 `.school-ticks i` 与
 * `SkillEditor.vue` 的 `.tick`），槽与填充的十几条声明逐字相同，只有「能不能点」不同。
 * 两处各存一份的代价不是行数，而是**改一处忘一处**：今天给刻度加圆角、把苔色改成朱，
 * 全靠人记得开两个文件。
 *
 * ## 它知道两件外面不该重复算的事
 *
 * ① **满级**：`isMaxed` 在这里判，填充与槽的描边都由这里转朱。原先卡上是
 *    `.school-row.full .school-ticks i`、弹窗是 `.school-erow.full .tick`——
 *    同一个状态被父级的选择器各写一次，父级的类名一改（`school-row` → `school-erow`）
 *    就静默失效。
 * ② **指针停在那一格的预览**：只有可点时才有。原先那段（`hoverTick` / `prefilled` /
 *    `tickStyle`）长在编辑页的脚本里，是为「刻度的显示」服务的逻辑，跟着刻度走才对。
 *
 * ## 两种形态
 *
 * `interactive` 决定根节点渲染 `<button>` 还是 `<span>`：
 *   - **可点**（编辑页）：`<button>`，点第 N 格 = 前 N 格全满，事件抛出的是**等级**
 *     而不是下标——调用方拿到的就是 `row.level` 该填的值，不必再 import `tickLevel`。
 *   - **只读**（卡片）：`<span>`。卡上那一排是读数，不是控件。
 *
 * 两者都 `tabindex="-1"` / `aria-hidden`（只读时）：七行 × 九格 = 六十三个 Tab 停靠点
 * 会把这张表变成键盘走不出去的地方，键盘用户走旁边的等级格。
 *
 * `cap` 缺席（不知道上限）时整块不渲染：没有分母的百分比是编出来的。返回的是注释节点，
 * 在 flex 列里不占位、也不吃 `gap`——所以调用方不必再包一层 `v-if`。
 */
import { computed, ref } from 'vue';
import { isMaxed, skillTicks, tickLevel } from './character';

const props = withDefaults(
    defineProps<{
        level: number;
        /** 上限。缺席 = 不知道，那一整排不画。 */
        cap?: number;
        /** 能不能点。卡上是读数，不给；编辑页给。 */
        interactive?: boolean;
    }>(),
    { cap: undefined, interactive: false },
);

const emit = defineEmits<{ pick: [level: number] }>();

const fills = computed(() => skillTicks(props.level, props.cap));
const full = computed(() => isMaxed({ level: props.level, cap: props.cap }));

/* 指针停在第几格（0 起）。只记下标而不是「哪一行」，因为组件一次只画一行。 */
const hover = ref<number | null>(null);

/* 指着某一格时，整条按「点下去的结果」重画：前 N 格满、后面全空。
 * 一格只有七像素高，没有这层预览，那一下点的是第几档全靠猜。 */
function fillOf(index: number, fill: number): number {
    if (!props.interactive || hover.value === null) return fill;
    return index <= hover.value ? 100 : 0;
}

function pick(index: number) {
    if (!props.interactive) return;
    emit('pick', tickLevel(index, props.cap));
}
</script>

<template>
    <span
        v-if="fills.length"
        class="ticks"
        :class="{ interactive, full }"
        :aria-hidden="interactive ? undefined : 'true'"
        @pointerleave="hover = null"
    >
        <component
            :is="interactive ? 'button' : 'span'"
            v-for="(fill, index) in fills"
            :key="index"
            class="tick"
            :type="interactive ? 'button' : undefined"
            :tabindex="interactive ? -1 : undefined"
            :style="{ '--fill': `${fillOf(index, fill)}%` }"
            :title="interactive ? `${tickLevel(index, cap)} 级` : undefined"
            @click="pick(index)"
            @pointerenter="interactive && (hover = index)"
        ></component>
    </span>
</template>

<style scoped>
.ticks {
    display: flex;
    gap: 3px;
}
/* 一格 = **凹槽 + 嵌在槽里的一截实心**。
 *
 * 为什么分两层（元素当槽、`::before` 当填充）：一条横向渐变只画得出「填了多少」，
 * 画不出「嵌进去的那一截有厚度」。槽自己带顶影（光从左上来，凹槽的上沿背光）与底沿
 * 一道亮线；填充再有上亮下暗的纵向渐变——一格才读作「槽里有东西」，而不是一根色棍。
 *
 * 圆角 2px：7px 高的格子配 1px 是「切边」，2px 才读作一小截胶囊，再大就成药丸。
 * **高度不能涨**：卡上七行已经铺满 478，每行多 1px 就溢出（第 61 批量过）。
 *
 * 槽的边界不能省：`--well` 在暗色只比 `--paper` 暗一档，7px 高的空格在深底上等于隐形，
 * 练到 30% 与 60% 只能靠填充的位置猜。描边浓度与 `.training-row .track` 同一条（48%）——
 * 修炼那条 4px 高、这条 7px，同一个「小槽」的尺寸档，边界该一样重。
 *
 * 不套全局 `.well`，只借它槽内那道上暗下亮的渐变（不加它 1px 的边框）：7px 高套整套
 * 会读成一枚胶囊，而这里要的是「槽」，不是「另一个控件」。光靠四道 inset 影，
 * 7px 里「凹进去」读不出来——空槽只是一个浅色小方块。 */
.tick {
    position: relative;
    flex: 1;
    height: 7px;
    /* 按钮形态的复位：`<button>` 自带 2px 边框与内边距，不清掉整根条会胖一圈。 */
    padding: 0;
    border: 0;
    border-radius: 2px;
    background-color: var(--well);
    background-image: linear-gradient(180deg, var(--bevel-lo), transparent 72%);
    box-shadow:
        inset 0 1px 2px var(--bevel-lo),
        inset 0 -1px 0 color-mix(in srgb, var(--bevel-hi) 55%, transparent),
        0 0 0 1px color-mix(in srgb, var(--rule-2) 48%, transparent);
    appearance: none;
}
/* 填充：宽度就是这一格的 `--fill`（`skillTicks` 给的 0–100）。右端也给 2px 圆角——
 * 半格时读作「一截短条」，比切齐的断口更像真的嵌了一条进去。
 *
 * ## 平时是墨，不是朱（2026-11-03 用户：「颜色有点太扎眼」，选了「退墨 · 满级才朱」）
 *
 * 原先不管练到几级都是朱。可一格只有 7px、九格连成一条、卡上一屏七行——朱在小面积上的
 * 高饱和被放大成「一排红棍」，一页 63 个红块，朱的「强调」被均摊得一点不剩。
 *
 * 现在：**墨色掺纸**（`--ink-2` 62% 混 `--paper-2`），读作「铅笔填的格」，不参与配色；
 * **练满那一行才转朱**（见下一条）。于是朱在这一页只剩一处——达成，与全站的
 * 「朱只给印、选中、达成」重新对上。
 *
 * 混的是 `--paper-2` 而不是 `--paper-base`：后者是不翻面的纸白，暗色下会把它掺成
 * 一块浅灰砖。`--paper-2` 跟着主题翻，两个主题的填充都是「比纸带深一点的墨」。 */
.tick::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: var(--fill, 0%);
    border-radius: 2px;
    background-image: linear-gradient(
        180deg,
        color-mix(in srgb, var(--ink-2) 48%, var(--paper-2)) 0%,
        color-mix(in srgb, var(--ink-2) 62%, var(--paper-2)) 45%,
        color-mix(in srgb, var(--ink-2) 74%, var(--paper-2)) 100%
    );
    box-shadow: inset 0 1px 0 color-mix(in srgb, var(--ink-2) 22%, var(--paper-base));
}

/* ---------- 满级：这一行才转朱 ----------
 * 三处同一个意思，都只发生在这一行：填充转朱（这里）、槽的描边转朱（下一条）、
 * 数转朱与印翻朱面（父级 `SkillRow` 管）。
 *
 * 为什么填充要换色而不是只描边：练到 180 与练到 170 的差别是「一格填满 / 差一格」，
 * 那条线本来就看得出来；这里要标的是**状态**——所以整条由墨转朱，七行里一眼就能点出
 * 哪几行满了。反过来，若平时也填朱（旧做法），满级只靠描边与数字转朱，几乎读不出来。 */
.ticks.full .tick::before {
    background-image: linear-gradient(
        180deg,
        color-mix(in srgb, var(--seal) 74%, var(--paper-base)) 0%,
        var(--seal) 42%,
        color-mix(in srgb, var(--seal) 82%, var(--ink-base)) 100%
    );
    box-shadow:
        inset 0 1px 0 color-mix(in srgb, var(--seal) 42%, var(--paper-base)),
        inset 0 -1px 0 color-mix(in srgb, var(--seal) 72%, var(--ink-base));
}
.ticks.full .tick {
    box-shadow:
        inset 0 1px 2px var(--bevel-lo),
        inset 0 -1px 0 color-mix(in srgb, var(--bevel-hi) 55%, transparent),
        0 0 0 1px color-mix(in srgb, var(--seal-edge) 55%, transparent);
}

/* ---------- 只有可点的那一份才有的三件事：光标、热区、预览 ----------
 * 预览是**所见即所得**：指着第 N 格时，前 N 格真的填满（见脚本里的 `fillOf`），
 * 指针停的那一格描朱边。上一版是「前 N 格填淡朱」——在填充也是朱时读得出来，
 * 改成平时填墨之后会骗人（指着第 6 格预览是红的，点下去变墨）；刷成 60% 不透明
 * 又太淡，7px 的小格上，一档透明的差别基本看不出（2026-11-03 实测）。
 * 所见即所得，也就不需要第三个状态。 */
.ticks.interactive {
    cursor: pointer;
}
/* 热区：条只有 7px 高，上下各撑 5px 才点得准。撑出去的部分落在纸带的上内边距里，
 * 不会盖到上一行 / 下一行的刻度上。 */
.ticks.interactive .tick::after {
    content: '';
    position: absolute;
    inset: -5px -1px;
}
/* 指针停在这一档：描边转朱，说明「这一格可以按」。放在 `.full` 之后：
 * 满级行里指着前两格时，要能看出「点了会降到 40」，仍给这道反馈。 */
.ticks.interactive .tick:hover {
    box-shadow:
        inset 0 1px 2px var(--bevel-lo),
        inset 0 -1px 0 color-mix(in srgb, var(--bevel-hi) 55%, transparent),
        0 0 0 1px color-mix(in srgb, var(--cinnabar) 55%, transparent);
}
</style>
