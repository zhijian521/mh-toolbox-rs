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
    <article class="char dual-rule">
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

<style scoped src="./character-card.css"></style>
