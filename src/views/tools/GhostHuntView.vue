<script setup lang="ts">
import SelectField from '../../components/SelectField.vue';
import PaperCard from '../../components/PaperCard.vue';
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '../../components/AppIcon.vue';
import CostSwitch from '../../components/CostSwitch.vue';
import PageShell from '../../components/PageShell.vue';
import PressButton from '../../components/PressButton.vue';
import MapCanvas from '../../components/ghost/MapCanvas.vue';
import { useDevMode } from '../../composables/use-dev-mode';
import { useGhostWatch } from '../../composables/use-ghost-watch';
import type { GhostPlan } from '../../services/ghost-model';
import GhostTestPanel from './GhostTestPanel.vue';

/**
 * 捉鬼助手。
 *
 * 页面只负责三件事：把 composable 的状态画出来、把每条任务画成一张地图、把
 * 开始/停止接到按钮上。时序与判定全在 `use-ghost-watch` 里——这一页不该知道
 * 轮询间隔是多少，也不该知道「连不稳要等两帧」「失败三次才报错」。
 * 状态那句话（`statusText`）连同灯色、引擎名、降级提示、缩放比一起住在
 * composable：它们是**判定**，换个页面还得是同一个结论，不是这一页的版式。
 *
 * 大小鬼是一起捉的，两条任务同时成立，所以两张图同卡上下分栏，一眼同时看到
 * 「小鬼往哪走、大鬼往哪走」。做成切换是把「看两个」变成「看一个再点一下」，
 * 而实际动作恰恰是两边来回跑。只有一条任务时就是单张吃满——
 * 分栏是内容的结果，不是布局的默认。
 *
 * 右下角那块「测试文字」不在这一页里（`GhostTestPanel`）：它是没有游戏时的临时替身，
 * 寿命比这一页短——真机能测之后删一个文件就干净了，这里一行都不用改。
 */

const router = useRouter();

const {
    running,
    starting,
    windows,
    selectedHwnd,
    report,
    plans,
    stats,
    engineLabel,
    ages,
    hot,
    testing,
    desktop,
    statusText,
    statusKind,
    degraded,
    scalePercent,
    toggle,
    prepare,
    start,
    applyTest,
    clearTest,
} = useGhostWatch();

const { devMode } = useDevMode();

/** 纠错对（`甲→乙`）按空格连成一句话，挂在「识别原文」的标题上。 */
const corrections = computed(() => {
    const list = report.value?.corrections ?? [];
    return list.map((item) => `${item.from}→${item.to}`).join(' ');
});

/** 头上只写「哪一条」。坐标与范围全在图上，这行不重复。 */
function kindLabel(plan: GhostPlan): string {
    return plan.task.kind === 'small' ? '小鬼' : '大鬼';
}

function mapLabel(plan: GhostPlan): string {
    return plan.mode === 'invalid' ? plan.task.mapText : plan.map.name;
}

onMounted(async () => {
    await prepare();
    // 进页面就自动开始：这一页的存在意义就是「不用手输坐标」，
    // 再让用户点一次开始是多余的。读不到游戏窗口时会立刻停下并说明原因。
    if (desktop) await start();
});
</script>

<template>
    <PageShell title="捉鬼助手" desc="任务栏 → 该往哪找">
        <template #actions>
            <!-- 页头两个动作走 `PressButton`：内容落在一块凸起的纸上，按下去被压回纸里。
                 主操作（开始/停止）用 `seal` 变体——块面灌朱，一眼能看出这页在跑什么。
                 尺寸用默认档 `md`（26px）：`lg` 是 31，加上下 padding 到 50，会把页头
                 顶高 4px 以上，与左栏牌记、其余页面的页头横线全部错开一格（2026-11-03 改，
                 原先这里写的 `lg` 正是那个错位的来源）。
                 文案只留动词（返回 / 开始 / 停止）：四个字会把按钮拉成一条，
                 动作方向先由图标读出——字是补充，不是主角。完整语义留在 label 里给读屏与悬停。 -->
            <PressButton
                icon="back"
                text="返回"
                label="返回工具列表"
                @click="router.push('/tools')"
            />
            <PressButton
                :icon="running ? 'stop' : 'play'"
                :text="running ? '停止' : '开始'"
                :label="running ? '停止识别（回到未开始）' : '开始识别任务栏'"
                seal
                :disabled="!desktop || starting"
                @click="toggle"
            />
        </template>

        <div class="hunt">
            <PaperCard class="map-card">
                <!-- 两条任务共用一张卡、卡内上下分栏：分两张卡等于给同一件事
                     加了道边框和一段额外间距，读的时候还多一层「这是两个物件」的错觉。 -->
                <div v-for="plan in plans" :key="plan.task.kind" class="map-item">
                    <!-- 头上只留「哪一条 · 哪张图」。坐标、范围格数、收窄比例全画在地图里，
                         这里再抄一遍等于同一句话看两遍，还把地图挤矮。 -->
                    <header class="map-head">
                        <span class="chip">{{ kindLabel(plan) }}</span>
                        <span class="head-map">{{ mapLabel(plan) }}</span>
                        <!-- 结果是被「保留」住的，不是每帧都在读——所以它会有年龄。
                             不标出来会变成一条不会消失的幽灵任务：任务早就交了，图上还在。
                             年龄按**这一条**算：两条任务独立读，共用同一个数会把一直在读的
                             那条也标成很旧。 -->
                        <span v-if="running && ages[plan.task.kind] >= 3" class="meta head-age">
                            {{ ages[plan.task.kind] }}s 前
                        </span>
                    </header>
                    <MapCanvas :plan="plan" />
                </div>
                <div v-if="!plans.length" class="map-item">
                    <MapCanvas :plan="null" />
                </div>
            </PaperCard>

            <aside class="hunt-side">
                <PaperCard class="side-block">
                    <div class="status" :class="statusKind">
                        <span class="status-dot" aria-hidden="true" />
                        <span class="status-text">{{ statusText }}</span>
                    </div>
                    <p v-if="stats" class="meta status-meta">
                        截屏 {{ stats.grabMs }}ms · 识别 {{ stats.ocrMs }}ms · 系统
                        {{ scalePercent }}%
                    </p>
                    <!-- 降级摊开在状态区，不藏进折叠的「识别原文」：
                         链路照跑、灯照样绿，不说的话看起来完全正常，只是字全认错。 -->
                    <p v-if="degraded" class="meta engine-warn">
                        模型没加载，正用系统 OCR
                        兜底：黄色、绿色的字基本认不出。重启应用可重试加载。
                    </p>

                    <div class="form-row">
                        <span class="field-label">监听窗口</span>
                        <SelectField
                            :model-value="selectedHwnd === null ? '' : String(selectedHwnd)"
                            :options="[
                                { value: '', label: '自动选择' },
                                ...windows.map((item) => ({
                                    value: String(item.hwnd),
                                    label: item.title,
                                })),
                            ]"
                            label="监听窗口"
                            :disabled="running"
                            @update:model-value="
                                selectedHwnd = $event === '' ? null : Number($event)
                            "
                        />
                    </div>
                    <!-- 两条说明都压到**一行**：原文各 28 字，在 306px 的侧栏里各折成两行，
                         两条摞起来占掉四行高度，中间还夹着「高概率区域」那行开关，
                         读起来像三段互不相干的备注。改成同一句式（短句 + 分号 + 短句）、
                         各 ≤24 字之后，两条都单行，长度也接近，才是「一对」说明。 -->
                    <p class="meta field-note">换窗口前先停止识别；游戏在前台，遮挡处截不到。</p>

                    <div class="form-row">
                        <span class="field-label">高概率区域</span>
                        <CostSwitch v-model="hot" off-label="关" on-label="开" class="hot-switch" />
                    </div>
                    <!-- 判定写死成一句，不再给三档选择：`≤50 / ≥150` 是社区共识的
                         唯一口径，「按比例」是把这两条线除以「假设坐标域 200」得来的，
                         坐标域不是 200 的图上两种口径会给出相反结论。 -->
                    <p class="meta field-note">假坐标 ≥150 往大、≤50 往小；51–149 无方向。</p>
                    <div class="legend">
                        <span class="legend-item">
                            <i class="legend-swatch legend-wash" aria-hidden="true" />官方 ±50
                        </span>
                        <span v-if="hot" class="legend-item">
                            <i class="legend-swatch legend-hot" aria-hidden="true" />高概率区域
                        </span>
                    </div>
                </PaperCard>

                <PaperCard v-if="report" as="details" class="detail-block">
                    <summary class="detail-head">
                        <AppIcon name="chevron-right" class="detail-arrow" />
                        识别原文
                        <span v-if="engineLabel" class="meta detail-tag">{{ engineLabel }}</span>
                        <span v-if="corrections" class="meta detail-tag"
                            >纠错 {{ corrections }}</span
                        >
                    </summary>
                    <!-- 按行原样列出而不是给拼接后的整串：任务栏会按像素折行，
                         「这个地名是不是被切断过」只有对着折行才看得出来。 -->
                    <ol class="detail-lines">
                        <li v-for="(line, index) in report.lines" :key="index">{{ line }}</li>
                    </ol>
                    <p v-for="issue in report.issues" :key="issue" class="meta detail-issue">
                        {{ issue }}
                    </p>
                </PaperCard>
            </aside>

            <!-- 测试文字：不开游戏也能把整条链跑起来。它受「开发者模式」管（`useDevMode`），
                 关着时连 DOM 都不生成——关着的东西用 `v-show` 藏，tab 仍能摸到。

                 关掉开关时不需要额外清测试数据：`testing` 是这一页的 ref（`useGhostWatch`
                 里 new 的），而改开关必须离开这一页去开发页，回来时组件已重建、本来就是空的。
                 别在这里补一个 `watch(devMode)`——它永远不会触发，是死代码。

                 写在 `.hunt` 里而不是外面，只为继承 `--side-col`：宽度与右栏取同一个值，
                 于是它与左边地图卡的间距恒等于 `.hunt` 的 gap（14px），放大字号也不再
                 被挤到贴边。`position: fixed` 让它不参与 grid 布局，放进容器不占格子。

                 但不塞进 `.hunt-side` 内部：那会与「监听窗口」「高概率区域」并排，读起来
                 像第五个设置项；而且它要「随时能开、不占版面」，折叠后只留一条标题栏。 -->
            <GhostTestPanel
                v-if="devMode"
                :testing="testing"
                :count="plans.length"
                @apply="applyTest"
                @exit="clearTest"
            />
        </div>
    </PageShell>
</template>

<style scoped>
/* 撑满内容区：这一页的主件是地图，高度不该由「估算的页头有多高」决定。
 * `.page-content` 是 flex: 1 且高度确定，所以 100% 拿到的就是「页头与页底边距之外」的净高。
 * 行写 `minmax(0, 1fr)` 才有确定的行高可供格子拉伸，否则行高仍是内容高。 */
.hunt {
    /* 右栏宽度。浮动的「测试文字」面板也引这一枚——两者同宽，于是面板与左边地图卡的
     * 间距恒等于下面的 `gap`（14px），放大字号也不会被挤到贴边。
     *
     * 写死 306 是安全的：窗口最小内宽 1024 时内容区 992，右栏仍取 306。原先写作
     * `minmax(248px, 306px)`，那个 248 的下限在实测的 1280 / 1024 两档里一次都没
     * 触发过——留着它只是让「面板要多宽」失去唯一答案。 */
    --side-col: 306px;

    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--side-col);
    grid-template-rows: minmax(0, 1fr);
    gap: 16px;
    height: 100%;
}
/* 一张卡片装下全部地图：卡内按任务竖着等分，两条各占一半、一条吃满。
 * 卡片高度跟着内容区走，不再拿 `100vh - 170` 估——估出来的是「大概」，
 * 而撑满拿到的是「正好剩这么多」，窗口一改两边就会差一截。 */
.map-card {
    display: flex;
    flex-direction: column;
    gap: 9px;
    min-height: 0;
    overflow: hidden;
}
/* `min-height: 0` 不能省：flex 子项默认 `min-height: auto`，会按内容高度顶回去，
 * 两张图各自撑高、整块溢出去。地图区至少要能压到 0，才轮得到 1fr 分配空间。 */
.map-item {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-height: 0;
}
/* 标题靠左，与地图左缘同一条竖线（地图也改成左对齐了）。
 * 两者居中的版本是把「组」交给中线去表达，而一屏两图上下的场景里，
 * 人扫的是左边缘——对齐左缘才能一眼分块。 */
.map-head {
    display: flex;
    flex: none;
    align-items: baseline;
    gap: 8px;
    padding-bottom: 5px;
}
/* 头上这一行是三样东西：类别签（全局 `.chip`，与门派签、技能签同一个件）、
 * 地名、年龄。这里只剩地名要一档正文大小——签自带框与字号，年龄走 `.meta`，
 * 两者都不该在页面里再写一份。 */
.head-map {
    font-size: var(--fs-sm);
}
/* 年龄靠右、最轻一档颜色（颜色与字号来自全局 `.meta`）：它只在「这一条最近没被读到」
 * 时出现，存在的意义是提醒而不是抢注意力。数字用等宽，两图同时陈旧时能竖着对齐。 */
.head-age {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
}
/* 子组件根元素会带父组件的 scope id，所以这里能直接命中 `.map-stage`。
 * 覆盖它的 `height: 100%`（父级是 flex 列，百分比高度没有确定的参照）。
 * 不用 `:deep()`：那样生成的是后代选择器，特异性反而比子组件自己那条低。 */
.map-item > .map-stage {
    flex: 1 1 0;
    height: auto;
    min-height: 0;
}
.hunt-side {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
}
.side-block {
    padding: var(--block-pad-tight);
}

/* ---------- 状态 ---------- */
.status {
    display: flex;
    align-items: center;
    gap: 7px;
}
.status-dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--muted);
}
/* 只有真的在识别时才点亮：朱色在这套界面里是「当前/要紧」的信号，
 * 未启动时给它上色，就等于说「这里正在发生什么」。 */
.status.live .status-dot {
    background: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}
.status.warn .status-dot {
    background: var(--warning);
}
.status-text {
    font-size: var(--fs-sm);
    overflow-wrap: anywhere;
}
.status.warn .status-text {
    color: var(--warning);
}
.status-meta {
    margin: 5px 0 0;
    letter-spacing: 0.04em;
}
/* 与 `.status.warn` 用同一个底（--warn-bg），但不抢状态灯：
 * 状态灯说的是「有没有在跑」，这条说的是「跑得对不对」，两件事不该共用一个灯。 */
.engine-warn {
    margin: 9px 0 0;
    padding: 7px 9px;
    border-radius: var(--r-2);
    background: var(--warn-bg);
}

/* ---------- 表单 ----------
 * 行是全局 `.form-row`（`base.css`：标签在左、控件在右、gap 10）——与设置页的
 * 「主题 / 字号」两行同一件东西，原先两处各写一份（gap 9 对 12、纵向 13 对 12）。
 * 这里只补纵向节奏：`.page-content` 里第一行要离状态区 12px，
 * 说明行（`.field-note`）夹在两行之间时用 6px 贴住它上面那一行。 */
.side-block > .form-row {
    margin-top: 12px;
}
/* `.field-label` 是全局的（`base.css`）：设置页的「主题 / 字号」与这里的
 * 「监听窗口 / 高概率区域」是同一种标签，原先两处各写一份逐字相同的规则。 */
.form-row :deep(.select-field) {
    flex: 1;
    min-width: 0;
}
.field-note {
    margin: 6px 0 0;
}
/* 开关靠右与「监听窗口」的下拉同一条竖线：两行都是「标签在左、控件在右」，
 * 对齐之后侧栏才读成一列表单，而不是一堆各在各处的零件。 */
.hot-switch {
    margin-left: auto;
}
/* 图例：两块色就是图上那两块，色值直接引 `MapCanvas` 用的同一令牌，
 * 两处各写一份就等于以后必然不同步。
 * 类名不叫 `.swatch`：开发页的色板已经用着那个名字（26×26 的令牌样本），
 * 同一个词在同一个仓里指两种尺寸的东西，grep 的时候会看错。 */
.legend {
    display: flex;
    flex-wrap: wrap;
    gap: 3px 12px;
    margin-top: 8px;
}
.legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--muted);
    font-size: var(--fs-mini);
}
.legend-swatch {
    display: block;
    width: 15px;
    height: 9px;
    border-radius: 1px;
}
.legend-wash {
    border: 1px solid var(--ghost-wash-edge);
    background: var(--ghost-wash);
}
.legend-hot {
    border: 1px solid var(--ghost-hot-edge);
    background: var(--ghost-hot);
}

/* ---------- 识别原文 ---------- */
.detail-block {
    padding: var(--block-pad-tight);
}
.detail-head {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: var(--fs-xs);
    cursor: pointer;
    list-style: none;
}
/* Safari/WebView2 的默认三角与这里的小箭头重复，去掉默认的。 */
.detail-head::-webkit-details-marker {
    display: none;
}
.detail-arrow {
    transition: transform var(--t-quick) var(--ease-soft);
}
.detail-block[open] .detail-arrow {
    transform: rotate(90deg);
}
.detail-tag {
    margin-left: auto;
    color: var(--ochre);
}
/* 序号弱化到颜色更浅的一档：它的作用是「看得出这是第几行」，
 * 不是让人去数行号，所以不做成表格那种带框的编号列。 */
.detail-lines {
    margin: 8px 0 0;
    padding-left: 18px;
    color: var(--ink-2);
    font-family: var(--font-ui);
    font-size: var(--fs-mini);
    line-height: 1.7;
}
.detail-lines li {
    overflow-wrap: anywhere;
}
.detail-lines li::marker {
    color: var(--muted);
}
.detail-issue {
    margin: 6px 0 0;
    color: var(--warning);
}

/* 测试文字面板的样式跟着组件走了（`GhostTestPanel.vue`）。
 * 它浮在这一页之上，但那份几何（宽度随字号、`max-height`、右下角落位）
 * 属于面板自己——留在这里会让「删掉测试功能」变成要在两个文件里各删一段。 */
</style>
