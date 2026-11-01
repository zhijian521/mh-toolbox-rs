<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '../../components/AppIcon.vue';
import PageShell from '../../components/PageShell.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import MapCanvas from '../../components/ghost/MapCanvas.vue';
import { useGhostWatch } from '../../composables/use-ghost-watch';
import { hasDesktop } from '../../services/desktop';
import { CONFIRM_FRAMES } from '../../services/ghost-hold';
import type { EdgeRule, GhostPlan } from '../../services/ghost-model';

/**
 * 捉鬼助手。
 *
 * 页面只负责三件事：把 composable 的状态画出来、把每条任务画成一张地图、提供启停。
 * 所有时序逻辑都在 `use-ghost-watch` 里——这一页不该知道轮询间隔是多少。
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
    error,
    stats,
    engine,
    dpi,
    settling,
    ages,
    rule,
    start,
    toggle,
    prepare,
} = useGhostWatch();

const desktop = hasDesktop();

const RULE_OPTIONS: { value: EdgeRule; label: string }[] = [
    { value: 'relative', label: '按比例' },
    { value: 'absolute', label: '按数值' },
    { value: 'off', label: '不收窄' },
];

/* 三句只回答「这一档怎么判」，不重复上面那行机制——否则每切一档都要重读一遍
 * 「鬼往边上跑」这件事，读三次就变成噪声。 */
const RULE_HINT: Record<EdgeRule, string> = {
    relative: '判定：某轴 ≤25% 或 ≥75% 算贴边。20 张图一套口径，与地图多大无关',
    absolute: '判定：≤50 往小、≥150 往大。小地图坐标到不了 150，几乎不触发',
    off: '不收窄：只给官方 ±50，不套经验规律',
};

const statusText = computed(() => {
    if (!desktop) return '浏览器预览里读不到屏幕';
    if (error.value) return error.value;
    if (starting.value) return '正在启动';
    if (!running.value) return '未开始';
    // 「识别中」不是「还没读到」：画面上的结果是留住的那一份，只是这一帧读到了
    // 另一套内容、还没连稳到足够可信。这句话必须说清楚在等什么，否则用户看到
    // 地图不动、灯在跳，只会以为卡住了。
    if (settling.value) return `另一套读法等 ${CONFIRM_FRAMES} 帧确认`;
    return '监听中';
});

const statusKind = computed<'idle' | 'live' | 'warn'>(() => {
    if (error.value) return 'warn';
    return running.value ? 'live' : 'idle';
});

const corrections = computed(() => {
    const list = report.value?.corrections ?? [];
    return list.map((item) => `${item.from}→${item.to}`).join(' ');
});

/**
 * 引擎名。两个名字刻意写得不一样长：`PP-OCRv4` 是正常态，看到「系统 OCR」
 * 就说明模型没加载、退回了 Windows 自带引擎——那时候识别差是预期的，不是新 bug。
 */
const engineLabel = computed(() => {
    if (!engine.value) return '';
    return engine.value === 'paddle' ? 'PP-OCRv4' : '系统 OCR';
});

/**
 * 是否退回了系统 OCR。
 *
 * 这条必须**自己说出来**。`ghost.rs` 在模型加载失败时会静默退回 `Windows.Media.Ocr`：
 * 截屏照截、正则照跑、状态灯照样是绿的，只有彩色字全认不出。用户看到的会是
 * 「识别水平就这样」，而不是「有个东西坏了」——2026-11-01 就是这样白等了一整天，
 * 当时真因只是打包漏了一个字典文件。
 *
 * 所以降级不许安静：引擎名挂在「识别原文」标题上还不够（那是折叠区，不点开看不见），
 * 要在状态区直接摊开。
 */
const degraded = computed(() => engine.value === 'windows');

/**
 * 系统缩放比。ROI 的标定值是在 125% 下量的，Rust 每帧按这个数换算成物理像素。
 *
 * 摆在状态行里是因为「改了系统缩放识别就变差」是真实踩过的坑：先确认这个数
 * 和系统设置一致，再怀疑别的。不一致就说明窗口不在你以为的那块屏上。
 */
const scalePercent = computed(() => Math.round((dpi.value / 96) * 100));

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

                    <div class="field field-block">
                        <span class="field-label">单边规则</span>
                        <!-- 先给机制再给口径：只写「按比例 / 按数值」四个字，用户无法判断
                             内框画得对不对，只能信。这行把凭据摆在操作之前。 -->
                        <p class="field-note field-lead">
                            经验：鬼只出现在假坐标贴近的那一侧——贴边的轴砍掉反向那一半。
                        </p>
                        <SteppedSlider
                            v-model="rule"
                            :options="RULE_OPTIONS"
                            label="单边规则"
                            class="rule-slider"
                        />
                    </div>
                    <p class="field-note">{{ RULE_HINT[rule] }}</p>
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
/* 单边规则独起一行：标签 + 滑块 + 两句说明横向排不进 248px 的侧栏，
 * 而三档的档名（按比例 / 按数值 / 不收窄）一个都不能缩成两字。 */
.field-block {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
}
/* 机制说明贴在标签下面，与滑块的间距比与标签的间距大一点：
 * 它是「这一段在讲什么」的引言，不是滑块的一部分。 */
.field-lead {
    margin: 1px 0 3px;
}
/* 滑块自己收缩到内容宽，这里让它吃满侧栏：三格等分靠的是 1fr，
 * 收缩状态下每格只有档名那么宽，点右半格容易落到空白处。 */
.rule-slider {
    width: 100%;
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
