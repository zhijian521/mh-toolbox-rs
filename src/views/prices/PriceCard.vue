<script setup lang="ts">
import { computed } from 'vue';
import PressButton from '../../components/PressButton.vue';
import PressTile from '../../components/PressTile.vue';
import { buildSparkBars } from './price-chart-path';
import { priceLabel } from '../../services/format';
import { currentPoint, priceBadge, recentPrices, updateSummary, type PriceItem } from './prices';

/**
 * 一张物价卡。
 *
 * 四段，照老系统那张价签：`名称 + 分类` / 虚线 / `价格 涨跌 走势` / `日期 + 三个入口`。
 * 虚线的意思是「上半写品名、下半写价钱」，不是装饰。
 *
 * ---- 为什么这么矮 ----
 * 卡高 122、内边距 8/10、价格 18px：用户要求「紧凑一些」。压的是留白与字号，
 * **结构一格没删**——四段都在，因为去掉任意一段都要在别处补回来一个入口或一个读数。
 * 网格因此能在一屏排下 5 行（原先 3 行）。
 *
 * ---- 高度只给 min-height ----
 * 字号有 1.0 / 1.1 两档（`--fs-scale`）。写死 `height` 会在 1.1 档把最后一行的字挤出卡外，
 * 而卡面边框与阴影还停在原高度，看起来像贴纸被撕开。给最小高度，内容多了让它自己长，
 * 同一行的其他卡由网格拉齐。
 *
 * ---- 整片上半区是一枚按钮，但点出两种结果 ----
 * 点名称或价格 = **记一笔价**（每天最常做的事），点涨幅或走势柱图 = **看历史**（偶尔回顾）。
 * 两者在同一个 `<button>` 里，靠 `data-role="history"` 标记区分，判定见 `onCardClick`。
 *
 * 不给整张卡挂 `@click`：底行还有三个动作，套一层可点容器就会出现
 * 「点删除却记了一笔价」这类事故。底行留在按钮外面，正是为了这件事。
 *
 * ---- 三个入口是文字，不是 PressButton ----
 * 三枚 26px 的印块并排会把 122 高的卡撑回 152。它们在这里是「一行的三个小门」，
 * 与 `ToolsView` 的整枚格子同类，属于可点区域而不是按钮器件；
 * 弹窗里那几个动作才是按钮器件（`PressButton`）。
 */
const props = defineProps<{ item: PriceItem }>();

const emit = defineEmits<{
    /** 点卡头：开这一件的走势与流水。 */
    open: [];
    log: [];
    edit: [];
    remove: [];
}>();

const current = computed(() => currentPoint(props.item));
/* `currentLabel.value` 是 `priceLabel()` 返回对象里的字段，不是 ref 的 `.value`。 */
const currentLabel = computed(() => priceLabel(current.value ? current.value.price : null));

/* 徽章与底行文案都属于「物价怎么读」，住在 `prices.ts` 里——同一套口径收益页、
 * 总览页迟早要用，留在某个组件的 setup 里下一页就得再抄一遍。
 * 这个组件从此只剩「这张卡长什么样」。 */
const badge = computed(() => priceBadge(props.item));
const footText = computed(() => updateSummary(props.item));

/**
 * 卡片读给辅助技术的名字。
 *
 * `<button>` 一旦给了 `aria-label`，ARIA 的 name-from-content 就被顶掉——按钮里的
 * 名称、分类小签、价格、涨跌对读屏**不再单独暴露**。而这张卡就是这一页的信息主体，
 * 所以读数必须拼进 label 里；否则读屏用户只能听到底行那句「11-03 · 8 条」，
 * 最要紧的价格与涨跌一格都没有。
 */
const cardLabel = computed(() => {
    const tag = props.item.sub || props.item.category;
    const price = currentLabel.value.unit
        ? `${currentLabel.value.value} ${currentLabel.value.unit}`
        : currentLabel.value.value;
    const trend = badge.value?.title ?? '还没有涨跌';
    /* 只说到键盘真能做到的那一步。「点涨幅或走势柱图看历史」曾经挂在这里，
     * 但那两个热区在 `<button>` 内部、键盘到不了（见 `onCardClick` 的已知代价），
     * 念给读屏用户一句做不到的操作，不如不说。 */
    return `${props.item.name}，${tag}，当前价 ${price}，${trend}；按回车记一笔价`;
});

/* 迷你柱图：坐标算法在 `price-chart-path.ts`，这里只给尺寸。
 * 56×14 是压过一档的：62×17 在 18px 的价格旁边会把价格挤窄。 */
const spark = computed(() => buildSparkBars(recentPrices(props.item), 56, 14));

/**
 * 卡片主体点一下 = **记一笔价**；只有点在涨幅或走势柱图上 = **看历史**。
 *
 * 这是按使用频率分的：一天里最常做的是「看到新行情就补一个价」，
 * 而回顾走势是隔几天才一次的事。所以大面积的点击留给记价，
 * 历史缩到那两个小块上——而不是反过来让人每次记价都得瞄准底行那枚小按钮。
 *
 * 判定走 `closest('[data-role="history"]')` 而不是在这里比对坐标：
 * 走势是 SVG（`event.target` 会落在 `path` 上）、涨幅是一个 `<span>`，
 * 两者唯一的共同点就是都能向上找到那个标记。
 *
 * 已知代价：键盘用户在卡片上按回车只能得到记价，历史打不开——
 * 一个 `<button>` 里没法再嵌一个可聚焦的按钮（HTML 内容模型不允许）。
 * 底行那三枚是独立的，将来若要补，加在那里才是正路。
 */
function onCardClick(event: MouseEvent) {
    const target = event.target;
    if (target instanceof Element && target.closest('[data-role="history"]')) {
        emit('open');
        return;
    }
    emit('log');
}
</script>

<template>
    <article class="price-card" :data-cat="item.category">
        <!-- 压印块只当**背景层**：一块纸，不带内容。
             早先是把内容塞进 `PressTile` 的默认插槽，结果被它那句
             `place-items: center` 按住，内容永远是居中的一块，从父级用 `:deep`
             覆盖已经验证过压不住（编译出来的特异性够了，实测仍然不生效）。
             改成兄弟层之后，内容自己排自己的，`PressTile` 只负责材质——
             它本来就不认识内容，这样才是它该待的位置。 -->
        <PressTile still class="card-surface" aria-hidden="true" />
        <div class="price-card-body">
            <button type="button" class="card-main" :aria-label="cardLabel" @click="onCardClick">
                <span class="card-head">
                    <b class="card-name" :title="item.name">{{ item.name }}</b>
                    <span
                        class="chip card-tag"
                        :title="item.sub ? `${item.category} · ${item.sub}` : item.category"
                    >
                        {{ item.sub || item.category }}
                    </span>
                </span>

                <span class="card-rule" aria-hidden="true" />

                <span class="card-price">
                    <b class="card-value">{{ currentLabel.value }}</b>
                    <small v-if="currentLabel.unit" class="card-unit">{{
                        currentLabel.unit
                    }}</small>
                    <span
                        v-if="badge"
                        class="card-delta"
                        :class="badge.tone"
                        :title="`${badge.title} · 点它看历史`"
                        data-role="history"
                    >
                        {{ badge.text }}
                    </span>
                    <svg
                        v-if="spark.length"
                        class="card-spark"
                        :class="badge?.tone"
                        viewBox="0 0 56 14"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                        data-role="history"
                    >
                        <rect
                            v-for="(bar, index) in spark"
                            :key="index"
                            :x="bar.x"
                            :y="bar.y"
                            :width="bar.width"
                            :height="bar.height"
                        />
                    </svg>
                </span>
            </button>

            <footer class="card-foot">
                <span class="meta card-meta">{{ footText }}</span>
                <span class="card-acts">
                    <button type="button" class="card-act" @click="emit('edit')">改</button>
                    <button type="button" class="card-act danger-action" @click="emit('remove')">
                        删
                    </button>
                    <!-- 「记」是这一页用得最勤的动作（每次看到新行情就来一下），
                         所以它单独做成一枚图标按钮，而不是和「改/删」一样的 9px 文字：
                         那一行的字是「偶尔维护」，这一枚是「每天要用」。 -->
                    <PressButton
                        class="card-log"
                        icon="add"
                        label="记一笔价"
                        @click="emit('log')"
                    />
                </span>
            </footer>
        </div>
    </article>
</template>

<style scoped>
/* 材质全部来自 `PressTile`——凸起纸块那一套（三层渐变 + 四条不对称棱 + 3px 硬影
 * + 8px 软影）是它调出来的，这里一份都不重写。
 *
 * 原先我照着棱和影自己写了一遍，**漏掉了那三层光**：只有四条边、没有「左上角被顶起来」
 * 的那点偏光，读起来是一张带边框的平面，而不是一块纸。这正是「3D 效果不佳」的来源。
 *
 * 这里只补两件 `PressTile` 不知道的事：
 * 1. 落地影收一档（`--tile-drop: 0.9`）——它是按 56px 的图标格调的，
 *    同样的 8px 软影摊在 200px 宽的卡上会散得太开；
 * 2. 内容层要铺满。它服务的是图标格，内容默认居中、宽度跟着内容走。
 *
 * 传 `still`：卡片本身不可点（可点的是里面那枚 `card-main`）。整块跟着 hover 变亮
 * 会读成「整张卡能点」，而点空白处其实没有反应。 */
/* 卡片本体只是一个定位容器：材质在背景层，内容在它上面。 */
.price-card {
    position: relative;
    display: flex;
}

/* ---------- 分类浅染 ----------
 * 九类各一组纸底，**只染纸面，字色一个都不动**（墨是名目、赭是价格、朱苔是涨跌）。
 * 这是它和「被否掉那版九色分类」的根本区别：那一版拿颜色表态，这一版只让纸分批。
 *
 * **色号在 `tokens.css`**（`--tint-*` / `--tint-deep-*`），这里只做分类名到令牌的映射。
 * 颜色不许裸写在组件里（§2.4-1）——18 个色号散在各处时，没人能一眼看全这套有几档。
 *
 * 给的值是纸的**深端**。`PressTile` 自己那三层光会把左上提亮，同一块纸于是自然读成
 * 「左上浅、右下深」——不必再叠一层渐变去替它的光，也就不必去覆盖它的 `background-image`
 * （那要跟组件内部规则比特异性，为「内容撑满」踩过一次，很脆）。
 *
 * 「其他」是兜底类：中性值，不跟任何具体品类抢注意力。
 * 分组来自 `prices-catalog.ts` 的 `PRICE_GROUPS`，九类一一对应——**改名要两处一起改**，
 * 对不上时浅染会静默失效（回落成纸色），不会报错。
 */
.price-card[data-cat='装备灵饰'] {
    --tint: var(--tint-装备灵饰);
    --tint-deep: var(--tint-deep-装备灵饰);
}
.price-card[data-cat='召唤兽'] {
    --tint: var(--tint-召唤兽);
    --tint-deep: var(--tint-deep-召唤兽);
}
.price-card[data-cat='兽决内丹'] {
    --tint: var(--tint-兽决内丹);
    --tint-deep: var(--tint-deep-兽决内丹);
}
.price-card[data-cat='宝石符石'] {
    --tint: var(--tint-宝石符石);
    --tint-deep: var(--tint-deep-宝石符石);
}
.price-card[data-cat='打造材料'] {
    --tint: var(--tint-打造材料);
    --tint-deep: var(--tint-deep-打造材料);
}
.price-card[data-cat='消耗补给'] {
    --tint: var(--tint-消耗补给);
    --tint-deep: var(--tint-deep-消耗补给);
}
.price-card[data-cat='任务产出'] {
    --tint: var(--tint-任务产出);
    --tint-deep: var(--tint-deep-任务产出);
}
.price-card[data-cat='通货账号'] {
    --tint: var(--tint-通货账号);
    --tint-deep: var(--tint-deep-通货账号);
}
.price-card[data-cat='其他'] {
    --tint: var(--tint-其他);
    --tint-deep: var(--tint-deep-其他);
}

/* 染色交给 `--tile-face`：`PressTile` 取的是 `var(--tile-face, 纸色)`，
 * 它没有在根元素上声明过这个变量，所以这里赋值就是最终值，不存在特异性竞争。
 * 没匹配到分类的（脏数据、改名后的旧值）回落到纸色，卡片照常凸起。 */
.card-surface {
    --tile-face: var(--tint, var(--paper));
}

/* 背景层：铺满整张卡，只给材质。
 *
 * 尺寸走 `--tile-w` / `--tile-h` 这两个变量，而**不直接写 `width` / `height`**：
 * `PressTile` 内部写着 `width: var(--tile-w, auto)`，与本类落在同一个元素上，
 * 两边特异性一样——直接写 `width` 又会回到「谁先注入谁赢」那个坑。
 * 变量没有这种竞争：同一个元素上只声明一次，取值就是它。 */
.card-surface {
    position: absolute;
    inset: 0;
    --tile-w: 100%;
    --tile-h: 100%;
    --tile-drop: 0.9;
}

/* 内容层在背景之上：上半区（点=记价）与底行三入口。 */
.price-card-body {
    position: relative;
    z-index: 1;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 122px;
    /* 左右 8：与上下的 7/8 齐平。
     * 中间试过 4——那是为了证明「内容能撑满」，压到只剩一圈内棱的间隙，
     * 结构验证完就该退回来：4px 在 260 宽的卡上读作「字贴着边」，8px 才是内衬。 */
    padding: 7px 8px 8px;
}

/* 可点的那一片：名称、虚线、价格、涨幅、柱图**全在里面**。
 *
 * 早先只有名称是可点的，用户的意见很具体：眼神落在价格或柱图上时点不动，
 * 得把鼠标挪回上面那一行名字才知道能点。现在整片上半区是一枚按钮，
 * 点到哪个数都会开历史。
 *
 * 仍然**不给整张卡挂 `@click`**：卡里还有三个动作，套一层可点容器就会出现
 * 「点删除却打开了历史」。底行留在按钮外面，就是为了这件事。 */
.card-main {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
}
.card-main:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
    border-radius: var(--r-1);
}
.card-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
}
.card-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    font-size: var(--fs-base);
    font-weight: 400;
    white-space: nowrap;
    text-overflow: ellipsis;
}
/* 名称与分类是两件事，不是一句话：名称吃剩余宽度、可以截断，
 * 分类小签不让位——它只有两三个字，被截掉一个就变成另一类了。 */
.card-tag {
    flex: none;
    font-size: var(--fs-mini);
    /* 签的底用 `--tint-deep`：与卡同色相、更深、更饱和。
     *
     * 亮色下它比纸深一档（深底浅字），暗色下比纸**亮**一档（浅底深字）——
     * 方向相反，但两边都是「让签从纸上浮出来」的同一个意思：暗色里没有更深的余地，
     * 再往下压就是纯黑，色相会整块消失。
     *
     * 字仍以墨为主（`--ink` 在两主题下自动是深/浅），颜色该由底来说，不该让字承担。 */
    background: var(--tint-deep, var(--rule-2));
    border-color: color-mix(in srgb, var(--tint-deep, var(--rule-2)) 62%, var(--ink));
    color: color-mix(in srgb, var(--ink) 92%, var(--tint-deep, var(--paper)));
}
.card-main:hover .card-name {
    color: var(--accent);
}

/* 品名与价钱之间那道虚线。 */
.card-rule {
    display: block;
    margin: 5px 0 4px;
    border-top: 1px dashed var(--rule-2);
}

.card-price {
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
}
/* 读数走 `--num`（赭）：墨是名目、赭是读数、朱是强调，三层不混（CONVENTIONS §2.4-38）。 */
.card-value {
    flex: none;
    color: var(--num);
    font-size: var(--fs-amount);
    font-weight: 400;
    line-height: 1.15;
    font-variant-numeric: tabular-nums;
}
.card-unit {
    flex: none;
    color: var(--num);
    font-size: var(--fs-mini);
}
/* 涨红跌绿（国内读法，与欧美相反）。三档之外没有第四种颜色。 */
.card-delta {
    flex: none;
    /* 推到右端：价格行也要两端对齐（用户要求「下面的也一样」）。
     * 涨幅与柱图都在回答「现在怎么样」，挨在一起才读得懂
     * 「涨 5.2%，而且这一路在往上」。 */
    margin-left: auto;
    color: var(--muted);
    font-size: var(--fs-mini);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.card-delta.up,
.card-spark.up {
    color: var(--cinnabar);
}
.card-delta.down,
.card-spark.down {
    color: var(--moss);
}
/* 柱图紧跟涨幅，**不再自己推右**——推右的任务交给 `.card-delta`（谁先谁吃剩余空间）。
 * 宽度固定不让位：价格那三个字宽度不定（「320 万」与「8.6 万」），
 * 线跟着文字走的话每张卡的线起点都不一样，一排看下来是锯齿。 */
.card-spark {
    flex: none;
    width: 56px;
    height: 14px;
    color: var(--muted);
    overflow: visible;
}
.card-spark rect {
    fill: currentColor;
    opacity: 0.85;
}

/* 涨幅与走势柱图是「看历史」的入口。同一枚按钮里两块地方点出两种结果，
 * 不给一点悬停反馈的话，用户只能靠试——体验上是「怎么有时开这个、有时开那个」。
 *
 * 这里用**降透明度**而不是全站惯用的「转朱」：这两块的色是**信息**（涨红跌绿），
 * 转朱会把「跌」染成「涨」的颜色。降透明度只表示「这一小块能点」，不碰色义。
 * 补 `transition` 与旁边那几处一致，否则一边渐变一边瞬变。 */
.card-delta[data-role='history'],
.card-spark[data-role='history'] {
    transition: opacity var(--t-quick) var(--ease-soft);
}
.card-delta[data-role='history']:hover,
.card-spark[data-role='history']:hover {
    opacity: 0.65;
}

/* 底行贴卡底：`margin-top: auto` 让它永远压在 122 的下沿，卡长高时也不上浮。 */
.card-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-top: auto;
    padding-top: 4px;
}
.card-meta {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}
/* 三个入口：两枚 9px 文字（偶尔维护）+ 一枚 26px 图标（每天要用）。
 * 文字那两个仍是真 `<button>`——键盘要能到、读屏要念得出来，只是视觉上压到最小。
 * 间距从 2 放到 4：文字与印块贴到 2px 时，那枚凸起的棱会顶到「删」的最后一笔上。 */
.card-acts {
    display: flex;
    flex: none;
    align-items: center;
    gap: 4px;
}
/* 底行那枚「记」：高频动作，但不该比旁边两个 9px 文字重一大截。
 *
 * 26px 的印块摆在小字旁边，尺寸和材质都比整行重一档，读起来像别的控件的按钮
 * 掉进来了（用户：「样式不是很搭配」）。收成 20px、圆角 4、落地影减到一半——
 * 仍然是同一块压印的纸，只是小一号，三个入口在同一行时重心持平。
 *
 * 选择器写成 `.card-acts .card-log` 而不是单个 `.card-log`：
 * `PressButton` 内部在 `.press-btn` 上声明了 `--tile-h` / `--tile-r` / `--icon-size`，
 * 两边都是 (0,2,0)，打平就交给注入顺序——多一层父级抬到 (0,3,0) 才稳。 */
.card-acts .card-log {
    --tile-h: calc(20px * var(--fs-scale));
    --tile-r: var(--r-3);
    --icon-size: calc(13px * var(--fs-scale));
    --tile-drop: 0.55;
}
.card-act {
    /* 命中区：9px 的字配 1px 内衬时实际只有 16×14，低于「指针落在框内任意处」的下限
     * （`.chip-action` 那 2px 6px 就是为这件事加的）。加到 3px 5px 之后约 22×20——
     * 仍比底行那枚 20px 的图标按钮矮半档，但手指已经按得住，视觉上只是字两侧多点空。 */
    padding: 3px 5px;
    border: 0;
    border-radius: var(--r-1);
    background: none;
    color: var(--muted);
    font-family: inherit;
    font-size: var(--fs-mini);
    line-height: 1.2;
    cursor: pointer;
    transition: color var(--t-quick) var(--ease-soft);
}
.card-act:hover {
    color: var(--action-ink);
}
.card-act:focus-visible {
    outline: var(--ring);
    /* 全站焦点环只有两档偏移：默认 `--ring-offset`（2px）与 VerticalSlider 的 -2px。
     * 这里原本写 1px，正是 2026-11-02 收掉的那四样（3 / 2 / 1 / -2）之一。 */
    outline-offset: var(--ring-offset);
}
</style>
