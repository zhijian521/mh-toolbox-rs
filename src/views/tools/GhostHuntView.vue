<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '../../components/AppIcon.vue';
import CostSwitch from '../../components/CostSwitch.vue';
import PageShell from '../../components/PageShell.vue';
import MapCanvas from '../../components/ghost/MapCanvas.vue';
import { useGhostWatch } from '../../composables/use-ghost-watch';
import type { GhostPlan } from '../../services/ghost-model';

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
    desktop,
    statusText,
    statusKind,
    degraded,
    scalePercent,
    toggle,
    prepare,
    start,
} = useGhostWatch();

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
            <button class="btn compact" type="button" @click="router.push('/tools')">
                返回工具
            </button>
            <button
                class="btn primary compact"
                type="button"
                :disabled="!desktop || starting"
                @click="toggle"
            >
                {{ running ? '停止识别' : '开始识别' }}
            </button>
        </template>

        <div class="hunt">
            <section class="frame map-card">
                <!-- 两条任务共用一张卡、卡内上下分栏：分两张卡等于给同一件事
                     加了道边框和一段额外间距，读的时候还多一层「这是两个物件」的错觉。 -->
                <div v-for="plan in plans" :key="plan.task.kind" class="map-item">
                    <!-- 头上只留「哪一条 · 哪张图」。坐标、范围格数、收窄比例全画在地图里，
                         这里再抄一遍等于同一句话看两遍，还把地图挤矮。 -->
                    <header class="map-head">
                        <span class="head-kind">{{ kindLabel(plan) }}</span>
                        <span class="head-map">{{ mapLabel(plan) }}</span>
                        <!-- 结果是被「保留」住的，不是每帧都在读——所以它会有年龄。
                             不标出来会变成一条不会消失的幽灵任务：任务早就交了，图上还在。
                             年龄按**这一条**算：两条任务独立读，共用同一个数会把一直在读的
                             那条也标成很旧。 -->
                        <span v-if="running && ages[plan.task.kind] >= 3" class="head-age">
                            {{ ages[plan.task.kind] }}s 前
                        </span>
                    </header>
                    <MapCanvas :plan="plan" />
                </div>
                <div v-if="!plans.length" class="map-item">
                    <MapCanvas :plan="null" />
                </div>
            </section>

            <aside class="hunt-side">
                <section class="frame side-block">
                    <div class="status" :class="statusKind">
                        <span class="status-dot" aria-hidden="true" />
                        <span class="status-text">{{ statusText }}</span>
                    </div>
                    <p v-if="stats" class="status-meta">
                        截屏 {{ stats.grabMs }}ms · 识别 {{ stats.ocrMs }}ms · 系统
                        {{ scalePercent }}%
                    </p>
                    <!-- 降级摊开在状态区，不藏进折叠的「识别原文」：
                         链路照跑、灯照样绿，不说的话看起来完全正常，只是字全认错。 -->
                    <p v-if="degraded" class="engine-warn">
                        模型没加载，正用系统 OCR
                        兜底：黄色、绿色的字基本认不出。重启应用可重试加载。
                    </p>

                    <div class="field">
                        <span class="field-label">监听窗口</span>
                        <select v-model="selectedHwnd" class="field-select" :disabled="running">
                            <option :value="null">自动（标题含「梦幻西游」）</option>
                            <option v-for="item in windows" :key="item.hwnd" :value="item.hwnd">
                                {{ item.title }}
                            </option>
                        </select>
                    </div>
                    <p class="field-note">
                        改窗口前先停止识别。游戏窗口要在前台，被挡住的部分截不到。
                    </p>

                    <div class="field">
                        <span class="field-label">高概率区域</span>
                        <CostSwitch v-model="hot" off-label="关" on-label="开" class="hot-switch" />
                    </div>
                    <!-- 判定写死成一句，不再给三档选择：`≤50 / ≥150` 是社区共识的
                         唯一口径，「按比例」是把这两条线除以「假设坐标域 200」得来的，
                         坐标域不是 200 的图上两种口径会给出相反结论。 -->
                    <p class="field-note">假坐标 ≤50 只往小走、≥150 只往大走；51–149 没有方向。</p>
                    <div class="legend">
                        <span class="legend-item">
                            <i class="swatch swatch-wash" aria-hidden="true" />官方 ±50
                        </span>
                        <span v-if="hot" class="legend-item">
                            <i class="swatch swatch-hot" aria-hidden="true" />高概率区域
                        </span>
                    </div>
                </section>

                <details v-if="report" class="frame detail-block">
                    <summary class="detail-head">
                        <AppIcon name="chevron-right" class="detail-arrow" />
                        识别原文
                        <span v-if="engineLabel" class="detail-tag">{{ engineLabel }}</span>
                        <span v-if="corrections" class="detail-tag">纠错 {{ corrections }}</span>
                    </summary>
                    <!-- 按行原样列出而不是给拼接后的整串：任务栏会按像素折行，
                         「这个地名是不是被切断过」只有对着折行才看得出来。 -->
                    <ol class="detail-lines">
                        <li v-for="(line, index) in report.lines" :key="index">{{ line }}</li>
                    </ol>
                    <p v-for="issue in report.issues" :key="issue" class="detail-issue">
                        {{ issue }}
                    </p>
                </details>
            </aside>
        </div>
    </PageShell>
</template>

<style scoped>
/* 撑满内容区：这一页的主件是地图，高度不该由「估算的页头有多高」决定。
 * `.page-content` 是 flex: 1 且高度确定，所以 100% 拿到的就是「页头与页底边距之外」的净高。
 * 行写 `minmax(0, 1fr)` 才有确定的行高可供格子拉伸，否则行高仍是内容高。 */
.hunt {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(248px, 306px);
    grid-template-rows: minmax(0, 1fr);
    gap: 14px;
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
.head-kind {
    padding: 0 4px;
    border: var(--w-hair) solid var(--rule-2);
    border-radius: var(--r-1);
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.06em;
}
.head-map {
    font-size: var(--fs-sm);
}
/* 年龄靠右、最轻一档颜色：它只在「这一条最近没被读到」时出现，
 * 存在的意义是提醒而不是抢注意力。数字用等宽，两图同时陈旧时能竖着对齐。 */
.head-age {
    margin-left: auto;
    color: var(--muted);
    font-size: var(--fs-mini);
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
    gap: 14px;
    min-width: 0;
}
.side-block {
    padding: 12px 14px 13px;
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
    background: var(--cinnabar);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--cinnabar) 22%, transparent);
}
.status.warn .status-dot {
    background: var(--ochre);
}
.status-text {
    font-size: var(--fs-sm);
    overflow-wrap: anywhere;
}
.status.warn .status-text {
    color: var(--ochre);
}
.status-meta {
    margin: 5px 0 0;
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.04em;
}
/* 与 `.status.warn` 用同一个底（--warn-bg），但不抢状态灯：
 * 状态灯说的是「有没有在跑」，这条说的是「跑得对不对」，两件事不该共用一个灯。 */
.engine-warn {
    margin: 9px 0 0;
    padding: 7px 9px;
    border-radius: var(--r-2);
    background: var(--warn-bg);
    color: var(--muted);
    font-size: var(--fs-mini);
    line-height: 1.6;
}

/* ---------- 表单 ---------- */
.field {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-top: 13px;
}
.field-label {
    flex: none;
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.14em;
}
/* 原生 select 只做最小化的外观修正：全套自绘下拉要处理键盘、滚动、边缘翻转，
 * 为两个选项引一整套不划算。这里只让它读起来属于这张纸。 */
.field-select {
    flex: 1;
    min-width: 0;
    padding: 3px 5px;
    border: var(--w-hair) solid var(--rule-2);
    border-radius: var(--r-2);
    background: var(--paper-2);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
}
.field-select:disabled {
    opacity: 0.6;
}
.field-note {
    margin: 6px 0 0;
    color: var(--muted);
    font-size: var(--fs-mini);
    line-height: 1.6;
}
/* 开关靠右与「监听窗口」的下拉同一条竖线：两行都是「标签在左、控件在右」，
 * 对齐之后侧栏才读成一列表单，而不是一堆各在各处的零件。 */
.hot-switch {
    margin-left: auto;
}
/* 图例：两块色就是图上那两块，色值直接引 `MapCanvas` 用的同一令牌，
 * 两处各写一份就等于以后必然不同步。 */
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
.swatch {
    display: block;
    width: 15px;
    height: 9px;
    border-radius: 1px;
}
.swatch-wash {
    border: 1px solid var(--ghost-wash-edge);
    background: var(--ghost-wash);
}
.swatch-hot {
    border: 1px solid var(--ghost-hot-edge);
    background: var(--ghost-hot);
}

/* ---------- 识别原文 ---------- */
.detail-block {
    padding: 10px 13px 12px;
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
    font-size: var(--fs-mini);
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
    color: var(--ochre);
    font-size: var(--fs-mini);
    line-height: 1.6;
}
</style>
