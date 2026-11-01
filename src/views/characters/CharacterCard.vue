<script setup lang="ts">
import { computed, ref } from 'vue';
import PressTile from '../../components/PressTile.vue';
import { useRovingFocus } from '../../composables/use-roving-focus';
import GearTip from './GearTip.vue';
import { PANES, type CharacterMock, type GearDetail, type PaneKey } from './mock';

/**
 * 一张角色卡：**一张纸上的五个分区**，用卡内页签切换。
 *
 * 为什么不是「侧边竖排按钮 + 一张长卡」：卡片宽 360 时侧栏会被挤到两张卡中间，
 * 变成第三列；而且名册要一行放三张，切换控件只能收进卡内。
 *
 * 为什么卡高写死 480：一行三张卡必须**齐头齐脚**，否则第二行会被最高那张顶歪。
 * 代价是内容少的分区（师门、修炼）底下会空一块，所以那几页把注脚用
 * `margin-top: auto` 压到卡底——空出来的部分读作页脚留白，而不是「没画完」。
 * 字号放大到 1.25 倍时卡内会开始滚动（`.char-body` 有 `overflow: auto` 兜底）。
 *
 * 页签里的「凹槽 + 选中灌朱」不在这里重写：单格质感来自全局 `.bevel-pill`、
 * `.well`、`.stamp`，外壳来自 `.pill-group`。装备格同理用 `PressTile`，
 * 材质与工具页的图标块是同一块——两处各写一套立体，迟早会写得不一样。
 */
const props = defineProps<{ character: CharacterMock }>();

const active = ref<PaneKey>('attrs');

const PANE_KEYS = PANES.map((pane) => pane.key);

/* 页签按 tablist 的键盘约定走：整组一个 Tab 停靠点，左右键在分区之间移动。
 * 与分段胶囊共用同一套实现，不另写一份「方向键换页签」。 */
const { cells, tabIndexFor, onKeydown } = useRovingFocus<PaneKey>({
    values: () => PANE_KEYS,
    activeValue: () => active.value,
    pick: (index) => {
        active.value = PANE_KEYS[index];
        closeTip();
    },
    axis: 'horizontal',
});

function choose(key: PaneKey) {
    active.value = key;
    closeTip();
}

/* ---------- 装备详情 ----------
 * 浮片自己算位置（要量自身尺寸），这里只负责「指向哪个格子、看哪件装备」。
 * 锚点存 rect 而不是元素：滚动或重建之后 rect 就过期了，存元素会让浮片停在旧位置。
 */
const tipDetail = ref<GearDetail | null>(null);
const tipAnchor = ref<DOMRect | null>(null);

function openTip(event: Event, detail?: GearDetail) {
    if (!detail) return;
    const cell = (event.currentTarget as HTMLElement).getBoundingClientRect();
    tipAnchor.value = cell;
    tipDetail.value = detail;
}

function closeTip() {
    tipDetail.value = null;
    tipAnchor.value = null;
}

const filled = computed(() => props.character.gear.filter((slot) => slot.detail).length);
</script>

<template>
    <article class="char">
        <header class="char-head">
            <div class="who-block">
                <div class="who">
                    <h2>{{ character.name }}</h2>
                    <span class="lv num">{{ character.level }} 级</span>
                    <span class="school">{{ character.school }}</span>
                </div>
                <p class="char-sub">
                    <template v-for="(sub, i) in character.subs" :key="sub">
                        <span v-if="i > 0" class="dot">·</span>
                        <span>{{ sub }}</span>
                    </template>
                </p>
            </div>
            <button class="more" type="button" aria-label="更多操作">⋯</button>
        </header>

        <div
            class="tabs pill-group"
            role="tablist"
            :aria-label="`${character.name} 的分区`"
            @keydown="onKeydown"
        >
            <button
                v-for="(pane, i) in PANES"
                :id="`${character.id}-tab-${pane.key}`"
                :key="pane.key"
                ref="cells"
                type="button"
                role="tab"
                class="tab bevel-pill radius-sm"
                :class="{
                    well: active !== pane.key,
                    on: active === pane.key,
                    stamp: active === pane.key,
                }"
                :aria-selected="active === pane.key"
                :aria-controls="`${character.id}-pane-${pane.key}`"
                :tabindex="tabIndexFor(i)"
                @click="choose(pane.key)"
            >
                {{ pane.label }}
            </button>
        </div>

        <div class="char-body" @scroll="closeTip">
            <!-- ---------- 属性：两列，每列两组 ---------- -->
            <section
                v-show="active === 'attrs'"
                :id="`${character.id}-pane-attrs`"
                class="pane"
                role="tabpanel"
                :aria-labelledby="`${character.id}-tab-attrs`"
            >
                <div class="attr-cols">
                    <div v-for="(column, ci) in character.attrColumns" :key="ci" class="attr-col">
                        <div v-for="group in column" :key="group.title">
                            <div class="group-head">
                                <span class="section-mark"></span>{{ group.title }}
                            </div>
                            <dl class="ledger">
                                <div v-for="row in group.rows" :key="row.label">
                                    <dt>{{ row.label }}<span class="leader"></span></dt>
                                    <dd class="num" :class="{ strong: row.strong }">
                                        {{ row.value
                                        }}<span v-if="row.sub" class="sub">{{ row.sub }}</span>
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    </div>
                </div>
                <p class="hint foot">{{ character.attrFoot }}</p>
            </section>

            <!-- ---------- 师门 ---------- -->
            <section
                v-show="active === 'skills'"
                :id="`${character.id}-pane-skills`"
                class="pane"
                role="tabpanel"
                :aria-labelledby="`${character.id}-tab-skills`"
            >
                <div class="skill-list">
                    <div v-for="row in character.skills" :key="row.name" class="skill-row">
                        <span class="name">{{ row.name }}</span>
                        <span class="leader"></span>
                        <span class="lv num" :class="{ max: row.max }">{{ row.level }}</span>
                        <span class="tag">{{ row.tag }}</span>
                    </div>
                </div>
                <p class="hint foot">{{ character.skillFoot }}</p>
            </section>

            <!-- ---------- 辅助 ---------- -->
            <section
                v-show="active === 'assist'"
                :id="`${character.id}-pane-assist`"
                class="pane"
                role="tabpanel"
                :aria-labelledby="`${character.id}-tab-assist`"
            >
                <div class="skill-list">
                    <div
                        v-for="row in character.assists"
                        :key="row.name"
                        class="skill-row"
                        :class="{ off: row.off }"
                    >
                        <span class="name">{{ row.name }}</span>
                        <span class="leader"></span>
                        <span class="lv num">{{ row.level }}</span>
                        <span class="tag">{{ row.tag }}</span>
                    </div>
                </div>
                <p class="hint foot">{{ character.assistFoot }}</p>
            </section>

            <!-- ---------- 修炼：全卡唯一带进度条的地方 ---------- -->
            <section
                v-show="active === 'training'"
                :id="`${character.id}-pane-training`"
                class="pane"
                role="tabpanel"
                :aria-labelledby="`${character.id}-tab-training`"
            >
                <div class="training-list">
                    <div
                        v-for="row in character.trainings"
                        :key="row.name"
                        class="training-row"
                        :class="{ done: row.value >= row.cap }"
                    >
                        <span class="name">{{ row.name }}</span>
                        <span class="track"
                            ><i :style="{ width: `${(row.value / row.cap) * 100}%` }"></i
                        ></span>
                        <span class="lv num">{{ row.value }} / {{ row.cap }}</span>
                    </div>
                </div>
                <p class="hint foot">{{ character.trainingFoot }}</p>
            </section>

            <!-- ---------- 装备：3 列 × 4 行，悬停看详情 ---------- -->
            <section
                v-show="active === 'gear'"
                :id="`${character.id}-pane-gear`"
                class="pane"
                role="tabpanel"
                :aria-labelledby="`${character.id}-tab-gear`"
            >
                <div class="gear-grid">
                    <template v-for="(slot, i) in character.gear" :key="`${slot.slot}-${i}`">
                        <button
                            v-if="slot.detail"
                            type="button"
                            class="gear-cell"
                            @mouseenter="openTip($event, slot.detail)"
                            @mouseleave="closeTip"
                            @focus="openTip($event, slot.detail)"
                            @blur="closeTip"
                        >
                            <PressTile class="gear-tile">
                                <span class="gear-inner">
                                    <span class="slot">{{ slot.slot }}</span>
                                    <span class="gear-name">{{ slot.caption }}</span>
                                </span>
                            </PressTile>
                        </button>
                        <!-- 空位是「挖掉的格」，不是「没画的格」：虚线方框躺在纸上，
                             与压印块的凸形成对照，一眼数得出还差几件。 -->
                        <div v-else class="gear-cell empty">
                            <span>{{ slot.slot }}</span>
                        </div>
                    </template>
                </div>
                <div class="gear-meta">
                    <span
                        ><span class="k">特技</span
                        ><span class="v seal">{{ character.gearMeta.special }}</span></span
                    >
                    <span
                        ><span class="k">套装</span
                        ><span class="v ochre">{{ character.gearMeta.suit }}</span></span
                    >
                    <span class="push num">{{ filled }}/{{ character.gear.length }}</span>
                </div>
            </section>
        </div>

        <GearTip :anchor="tipAnchor" :detail="tipDetail" />
    </article>
</template>

<style scoped>
/* ======================================================================
 * 卡片本体
 * ==================================================================== */
.char {
    position: relative;
    display: flex;
    flex: none;
    flex-direction: column;
    /* 360 × 480 = 0.75，与游戏「人物属性」面板同为竖版。 */
    width: 360px;
    height: 480px;
    border: var(--w-hair) solid var(--rule-2);
    background: var(--paper);
    box-shadow:
        0 1px 2px var(--shadow),
        0 10px 22px -12px var(--shadow-lg);
}
/* 文武线内衬：与 `.frame` 同一套，用 ::before 免得再包一层。 */
.char::before {
    content: '';
    position: absolute;
    inset: 3px;
    z-index: 0;
    border: var(--w-hair) solid var(--rule);
    pointer-events: none;
}

.char-head {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    flex: none;
    padding: 11px 14px 9px;
}
.who-block {
    min-width: 0;
}
.who {
    display: flex;
    align-items: baseline;
    gap: 7px;
    min-width: 0;
}
.who h2 {
    font-size: calc(var(--fs-md) + 2px);
    letter-spacing: 0.06em;
    line-height: 1.2;
    white-space: nowrap;
}
.lv {
    color: var(--ink-2);
    font-size: var(--fs-sm);
}
.school {
    padding: 1px 5px;
    border: var(--w-hair) solid var(--rule-2);
    border-radius: var(--r-1);
    color: var(--ochre);
    font-size: var(--fs-mini);
    letter-spacing: 0.08em;
}
.more {
    flex: none;
    width: 22px;
    height: 22px;
    margin-left: auto;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: var(--fs-sm);
    line-height: 1;
}
.more:hover {
    color: var(--cinnabar);
}
.char-sub {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-top: 3px;
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.04em;
}
.char-sub .dot {
    opacity: 0.5;
}

/* ---------- 卡内页签 ----------
 * 外壳用全局 `.pill-group`（`--paper-2` 承载面 + 3px 内边距），只管排布：
 * 覆盖成等宽五列。`.pill-group` 原本是 `inline-flex`（按内容宽），
 * 而卡内要的是「五个格子均分整条」——那个差异属于调用方的排版，写在这里。
 */
.tabs {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    flex: none;
    margin: 0 12px;
}
/* 胶囊默认 `min-height: 23px` 是按「一行字」定的；卡内页签要更矮一点，
 * 免得页签条从正文里抢走一整行数据的高度。 */
.tabs :deep(.bevel-pill) {
    padding: 2px 4px;
    font-size: var(--fs-xs);
    letter-spacing: 0.04em;
}

.char-body {
    position: relative;
    z-index: 1;
    flex: 1;
    min-height: 0;
    padding: 10px 14px 12px;
    overflow: auto;
    /* 滚动条始终占位：五个分区的宽度必须一致，否则切页签时整列文字会左右跳。 */
    scrollbar-gutter: stable;
}

/* 卡高固定，内容少的分区把注脚压到卡底，空白就成了「间距」而不是「没画完」。 */
.pane {
    display: flex;
    flex-direction: column;
    min-height: 100%;
}
.pane .foot {
    margin-top: auto;
    padding-top: 10px;
}

/* ======================================================================
 * 属性
 * ==================================================================== */
.attr-cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    flex: 1;
    gap: 0 18px;
}
/* 两组靠上排、不上下摊开：摊开会在卡中间挖出一个 90px 的洞，比底部留白更难看。 */
.attr-col {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.group-head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 1px;
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.14em;
}
.group-head .section-mark {
    --mark-w: 3px;
    --mark-h: 11px;
}
.ledger {
    display: grid;
}
.ledger > div {
    display: flex;
    align-items: baseline;
    gap: 5px;
    min-width: 0;
    padding: 3px 0;
    font-size: var(--fs-sm);
}
/* 点线放在 dt 内部而不是 dt 与 dd 之间：`<dl><div><dt/><span/><dd/></div></dl>`
 * 的 span 不是 dt/dd，不属于 dl 的内容模型。dt 吃掉剩余宽度、点线在其中撑开，
 * 视觉与「夹在中间」完全一致。 */
.ledger dt {
    display: flex;
    flex: 1;
    align-items: baseline;
    gap: 5px;
    min-width: 0;
    color: var(--ink-2);
}
.ledger .leader {
    flex: 1;
    min-width: 8px;
    height: 0;
    border-bottom: var(--w-hair) dotted color-mix(in srgb, var(--rule-2) 62%, transparent);
    transform: translateY(-3px);
}
.ledger dd {
    flex: none;
    margin: 0;
    color: var(--ink);
}
.ledger dd .sub {
    color: var(--muted);
    font-size: var(--fs-mini);
}
.ledger dd.strong {
    color: var(--cinnabar);
}

/* ======================================================================
 * 师门 / 辅助
 * ==================================================================== */
.skill-list {
    display: grid;
    flex: 1;
    /* 卡高固定，行数少的分区把行距摊开，而不是在底下留一截空白。 */
    align-content: space-between;
}
.skill-row {
    display: flex;
    align-items: baseline;
    gap: 7px;
    padding: 8px 0 7px;
    border-bottom: var(--w-hair) solid var(--rule);
    font-size: var(--fs-sm);
}
.skill-row .name {
    color: var(--ink);
}
.skill-row .leader {
    flex: 1;
    height: 0;
    border-bottom: var(--w-hair) dotted color-mix(in srgb, var(--rule-2) 55%, transparent);
    transform: translateY(-3px);
}
.skill-row .lv {
    color: var(--ink-2);
}
.skill-row .lv.max {
    color: var(--cinnabar);
}
.skill-row .tag {
    flex: none;
    padding: 0 4px;
    border: var(--w-hair) solid var(--rule-2);
    border-radius: var(--r-1);
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.06em;
}
.skill-row.off .name,
.skill-row.off .lv {
    color: var(--muted);
}

/* ======================================================================
 * 修炼
 * ==================================================================== */
.training-list {
    display: grid;
    flex: 1;
    align-content: space-between;
    gap: 20px;
}
.training-row {
    display: grid;
    grid-template-columns: 62px 1fr 42px;
    align-items: center;
    gap: 8px;
    font-size: var(--fs-sm);
}
.training-row .name {
    color: var(--ink);
}
.training-row .track {
    position: relative;
    height: 4px;
    border-radius: 2px;
    background-color: var(--well);
    box-shadow: inset 0 1px 2px var(--bevel-lo);
}
/* 用 `--moss` 而不是蓝：这套语言的辅助色只有赭与苔，绿条 + 朱色数字正好分开
 * 「在练」与「已满」两种状态。
 * 高光是独立的 box-shadow，不写进 background 简写——简写里只要有一个值解析失败
 * （比如引了不存在的令牌），整条声明都会被丢掉，条会静默变成透明。 */
.training-row .track i {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: var(--moss);
    box-shadow: inset 0 1px 0 color-mix(in srgb, var(--moss) 55%, #fff);
}
.training-row .lv {
    color: var(--muted);
    font-size: var(--fs-xs);
    text-align: right;
}
.training-row.done .lv {
    color: var(--cinnabar);
}

/* ======================================================================
 * 装备
 * ==================================================================== */
.gear-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
}
.gear-cell {
    display: block;
    height: 66px;
    padding: 0;
    border: 0;
    border-radius: var(--r-2);
    background: none;
    text-align: left;
    font-family: var(--font-ui);
    color: var(--ink);
}
.gear-tile {
    /* 底是 `--paper`，沿用 PressTile 默认的半透明纸色会与卡面同色，只剩棱、读不出「凸」。 */
    --tile-w: 100%;
    --tile-h: 66px;
    --tile-r: var(--r-2);
    --tile-face: var(--paper-2);
    --tile-drop: 1;
}
/* PressTile 悬停会把块面提亮成 `--paper`，而卡底就是 `--paper`——
 * 在工具页（底是更暗的 `--bg`）那是「块面转实」，在卡片上等于把块面抹平。
 * 这里只把面上按回 `--paper-2`；影子仍随悬停拉长，「块底下抬起一点」照样读得出。 */
.gear-grid .gear-cell:hover :deep(.press-tile) {
    background-color: var(--paper-2);
}
.gear-inner {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    width: 100%;
    padding: 0 8px;
    box-sizing: border-box;
}
.gear-inner .slot {
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.12em;
    transition: color var(--t-quick) var(--ease-soft);
}
.gear-inner .gear-name {
    width: 100%;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-xs);
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.gear-cell:hover .slot {
    color: var(--cinnabar);
}
.gear-cell:focus-visible {
    outline: 2px solid var(--cinnabar);
    outline-offset: 2px;
}
.gear-cell.empty {
    display: grid;
    place-items: center;
    border: var(--w-hair) dashed var(--rule-2);
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.1em;
    cursor: default;
}
.gear-meta {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-top: 9px;
    padding-top: 7px;
    border-top: var(--w-hair) solid var(--rule-2);
    color: var(--ink-2);
    font-size: var(--fs-mini);
}
.gear-meta .k {
    margin-right: 4px;
    color: var(--muted);
    letter-spacing: 0.1em;
}
.gear-meta .v.seal {
    color: var(--cinnabar);
}
.gear-meta .v.ochre {
    color: var(--ochre);
}
.gear-meta .push {
    margin-left: auto;
    color: var(--muted);
}
</style>
