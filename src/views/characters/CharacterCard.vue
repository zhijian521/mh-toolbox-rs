<script setup lang="ts">
import { computed, ref } from 'vue';
import PressTile from '../../components/PressTile.vue';
import { useRovingFocus } from '../../composables/use-roving-focus';
import GearTip from './GearTip.vue';
import PetTip from './PetTip.vue';
import { PANES, type CharacterData, type GearDetail, type PaneKey, type Pet } from './character';

/**
 * 一张角色卡：**一张纸上的六个分区**，用卡内页签切换。
 *
 * 为什么不是「侧边竖排按钮 + 一张长卡」：卡片宽 360 时侧栏会被挤到两张卡中间，
 * 变成第三列；而且名册要一行放三张，切换控件只能收进卡内。
 *
 * 为什么卡高写死 480：一行三张卡必须**齐头齐脚**，否则第二行会被最高那张顶歪。
 * 代价是内容少的分区（辅助）底下会空一块，所以那几页把注脚用 `margin-top: auto`
 * 压到卡底——空出来的部分读作页脚留白，而不是「没画完」。
 *
 * 六个页签均分卡宽：336 / 6 = 56px 一格，最长的「召唤兽」三个字约 43px（1.1 字号档
 * 约 46），放得下但不宽松。**再加第七个页签就得改文案或改两行**——56px 是这套
 * 页签的余量底线，不是起点。
 *
 * 页签里的「凹槽 + 选中灌朱」不在这里重写：单格质感来自全局 `.bevel-pill`、
 * `.well`、`.stamp`，外壳来自 `.pill-group`。装备格同理用 `PressTile`，
 * 材质与工具页的图标块是同一块——两处各写一套立体，迟早会写得不一样。
 */
const props = defineProps<{ character: CharacterData }>();

const active = ref<PaneKey>('attrs');

const PANE_KEYS = PANES.map((pane) => pane.key);

/* 页签按 tablist 的键盘约定走：整组一个 Tab 停靠点，左右键在分区之间移动。
 * 与分段胶囊共用同一套实现，不另写一份「方向键换页签」。 */
const { cells, tabIndexFor, onKeydown } = useRovingFocus<PaneKey>({
    values: () => PANE_KEYS,
    activeValue: () => active.value,
    pick: (index) => {
        active.value = PANE_KEYS[index];
        closeAll();
    },
    axis: 'horizontal',
});

function choose(key: PaneKey) {
    active.value = key;
    closeAll();
}

/* ---------- 浮片：装备与召唤兽共用一份「指向哪个格子」的状态 ----------
 * 两个浮片内容不同，但「悬停/聚焦 → 量锚点 → 由浮片自己算落位」这套流程一样，
 * 所以状态只留一份。锚点存 rect 而不是元素：滚动或重建之后 rect 就过期了，
 * 存元素会让浮片停在旧位置。
 */
type TipPayload = { kind: 'gear'; detail: GearDetail } | { kind: 'pet'; pet: Pet };

const tip = ref<TipPayload | null>(null);
const tipAnchor = ref<DOMRect | null>(null);

function openTip(event: Event, payload: TipPayload) {
    tipAnchor.value = (event.currentTarget as HTMLElement).getBoundingClientRect();
    tip.value = payload;
}

function closeAll() {
    tip.value = null;
    tipAnchor.value = null;
}

const gearTip = computed(() => (tip.value?.kind === 'gear' ? tip.value.detail : null));
const petTip = computed(() => (tip.value?.kind === 'pet' ? tip.value.pet : null));

const filled = computed(() => props.character.gear.filter((slot) => slot.detail).length);
</script>

<template>
    <article class="char dual-rule">
        <header class="char-head">
            <div class="who-block">
                <div class="who">
                    <h2>{{ character.name }}</h2>
                    <span class="lv num">{{ character.level }} 级</span>
                    <span class="chip school">{{ character.school }}</span>
                </div>
                <p class="meta char-sub">
                    <template v-for="(sub, i) in character.subs" :key="sub">
                        <span v-if="i > 0" class="dot">·</span>
                        <span>{{ sub }}</span>
                    </template>
                </p>
            </div>
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

        <div class="char-body" @scroll="closeAll">
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
                    <div
                        v-for="row in character.skills"
                        :key="row.name"
                        class="skill-row"
                        :class="{ off: row.off }"
                    >
                        <span class="name">{{ row.name }}</span>
                        <span class="leader"></span>
                        <span
                            class="lv num"
                            :class="{ max: row.cap !== undefined && row.level >= row.cap }"
                        >
                            {{ row.level }}
                        </span>
                        <!-- 只有在知道上限时才挂签：不知道就不猜，宁可少一个提示。
                             截图里 120 与 115 都出现过朱色，说明朱色不是满级标记。 -->
                        <span
                            v-if="row.cap !== undefined"
                            class="chip tag"
                            :class="{ on: row.level >= row.cap }"
                        >
                            {{ row.level >= row.cap ? '满' : `/${row.cap}` }}
                        </span>
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
                        <span v-if="row.off" class="chip tag">未学</span>
                    </div>
                </div>
                <p class="hint foot">{{ character.assistFoot }}</p>
            </section>

            <!-- ---------- 修炼：两组，组是游戏自己划的 ---------- -->
            <section
                v-show="active === 'training'"
                :id="`${character.id}-pane-training`"
                class="pane"
                role="tabpanel"
                :aria-labelledby="`${character.id}-tab-training`"
            >
                <div class="training-groups">
                    <div v-for="group in character.trainings" :key="group.title">
                        <div class="group-head">
                            <span class="section-mark"></span>{{ group.title }}
                        </div>
                        <div class="training-list">
                            <div
                                v-for="row in group.rows"
                                :key="row.name"
                                class="training-row"
                                :class="{ done: row.level >= row.cap, idle: row.level === 0 }"
                            >
                                <span class="name">{{ row.name }}</span>
                                <span class="track"
                                    ><i :style="{ width: `${(row.level / row.cap) * 100}%` }"></i
                                ></span>
                                <span class="lv num">{{ row.level }}/{{ row.cap }}</span>
                            </div>
                        </div>
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
                            @mouseenter="openTip($event, { kind: 'gear', detail: slot.detail })"
                            @mouseleave="closeAll"
                            @focus="openTip($event, { kind: 'gear', detail: slot.detail })"
                            @blur="closeAll"
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
                <div class="meta gear-meta">
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

            <!-- ---------- 召唤兽：纵向列表，悬停看资质 ----------
                 不做网格：一只兽的核心信息（六项资质 + 成长 + 五行 + 寿命）比一件装备多，
                 塞进 100px 宽的格子里只写得下名字。列表一屏能看四五只，
                 正好对得上「携带 4 / 7」这个量级。 -->
            <section
                v-show="active === 'pets'"
                :id="`${character.id}-pane-pets`"
                class="pane pane-pets"
                role="tabpanel"
                :aria-labelledby="`${character.id}-tab-pets`"
            >
                <div v-if="character.pets.length" class="pet-list">
                    <button
                        v-for="pet in character.pets"
                        :key="pet.name"
                        type="button"
                        class="pet-row"
                        @mouseenter="openTip($event, { kind: 'pet', pet })"
                        @mouseleave="closeAll"
                        @focus="openTip($event, { kind: 'pet', pet })"
                        @blur="closeAll"
                    >
                        <span class="pet-name">{{ pet.name }}</span>
                        <span class="leader"></span>
                        <span class="lv num">{{ pet.level }} 级</span>
                        <span class="chip pet-join">参战 {{ pet.joinLevel }}</span>
                    </button>
                </div>
                <p v-else class="empty-note">还没有记录召唤兽</p>
                <p class="hint foot">{{ character.petFoot }}</p>
            </section>
        </div>

        <GearTip :anchor="tipAnchor" :detail="gearTip" />
        <PetTip :anchor="tipAnchor" :pet="petTip" />
    </article>
</template>

<style scoped src="./character-card.css"></style>
