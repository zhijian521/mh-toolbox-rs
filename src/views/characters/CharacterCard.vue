<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import MeterBar from '../../components/MeterBar.vue';
import PressButton from '../../components/PressButton.vue';
import PressTile from '../../components/PressTile.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import GearTip from './GearTip.vue';
import PetTip from './PetTip.vue';
import { assistIcon } from '../../services/game-icons';
import {
    PANES,
    expPercent,
    type CharacterData,
    type AssistSkill,
    type GearDetail,
    type PaneKey,
    type Pet,
} from './character';

/**
 * 一张角色卡：**一张纸上的六个分区**，用卡内页签切换。
 *
 * 为什么不是「侧边竖排按钮 + 一张长卡」：卡宽只有 450，侧栏一挤就变成第三列；
 * 而且名册一行要放两张，切换控件只能收进卡内。
 *
 * 为什么卡高写死 540：同一行的卡必须**齐头齐脚**，否则第二行会被最高那张顶歪。
 * 代价是内容少的分区（召唤兽）底下会空一块，所以那几页把注脚用 `margin-top: auto`
 * 压到卡底——空出来的部分读作页脚留白，而不是「没画完」。
 *
 * 六个页签均分卡宽：`(450 − 28 − 4) / 6 ≈ 69.7` 一格，最长的「召唤兽」三个字
 * 在 1.1 字号档约 46px，余量 23。卡宽一改就要重算这个数，**仍是六格封顶**——
 * 再加第七个得改文案或改成两行。
 *
 * 页签里的「凹槽 + 选中灌朱」不在这里重写：它是 `SteppedSlider` 的 `as="tab"`——
 * 六格等分、印按格位移、方向键换页签全在那边，本组件只给它 `options` 与 `prefix`。
 * 早先这里是六个 `.bevel-pill`（各自一枚按钮，选中即灌朱），换掉的理由不是好看：
 * 六个胶囊在同一块板上读作「六个独立开关」，而它们实际是**一条轨道上的六个落点**。
 * 装备格同理用 `PressTile`，材质与工具页的图标块是同一块。
 */
const props = defineProps<{ character: CharacterData }>();
const emit = defineEmits<{ edit: []; remove: [] }>();

const active = ref<PaneKey>('attrs');

/* 页签的值与文案一次算好：滑块要的是 `{ value, label }[]`，而 `PANES` 是只读元组，
 * 直接在模板里 `map` 会每次渲染新建一个数组，`useRovingFocus` 的 `values()` 也随之变。 */
const PANE_OPTIONS = PANES.map((pane) => ({ value: pane.key, label: pane.label }));

function choose(key: PaneKey) {
    active.value = key;
    closeAll();
}

/* ---------- 删除：先问一次，再动手 ----------
 * 角色是手工一条一条录进来的，删掉没有回收站（名册只存一份到 localStorage），
 * 所以「点一次就删」的代价太大。这里不弹确认框：页面上没有对话框这种器件，
 * 为一处删除造一个，等于把系统弹窗那套观感搬进账簿。
 * 做法是把那枚按钮**就地改成「确认」**——第二次点击的目标没变，误触也变不成误删。
 * 4 秒没有下文就退回原样：停在一个朱红的「确认」上，别人走过来会以为这一格本来就是删。
 */
const pendingDelete = ref(false);
let resetTimer: ReturnType<typeof setTimeout> | undefined;

function askDelete() {
    pendingDelete.value = true;
    resetTimer = setTimeout(() => (pendingDelete.value = false), 4000);
}

function confirmDelete() {
    clearTimeout(resetTimer);
    pendingDelete.value = false;
    emit('remove');
}

onBeforeUnmount(() => clearTimeout(resetTimer));

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

/* 经验条的两个值：百分比在 `character.ts` 里算（纯函数、有单测），这里只负责文案。
 * 两者都没填就不显示文字——一根空轨道配一个空字符串会把这一行压成一条灰线。 */
const expPercentValue = computed(() =>
    expPercent(props.character.experience.value, props.character.experience.need),
);

/* 生活与剧情分两段，各自一张格子图。空的那一类不出现——
 * 一个只有生活技能的角色，不该看到一行「剧情技能」然后底下什么都没有。 */
const assistGroups = computed(() =>
    [
        { title: '生活技能', rows: props.character.assists.filter((row) => row.kind === 'life') },
        { title: '剧情技能', rows: props.character.assists.filter((row) => row.kind === 'story') },
    ].filter((group) => group.rows.length > 0),
);

/* 图标按「名字 + 类」查（`services/game-icons.ts`）：生活技能与剧情技能是两套文件名，
 * 名字在两张表里都可能出现（比如「冥想」只在生活表里），所以必须带 kind 一起查。 */
function iconOf(row: AssistSkill): string | undefined {
    return assistIcon(row.name, row.kind);
}

const expText = computed(() => {
    const { value, need } = props.character.experience;
    if (value && need) return `${value} / ${need}`;
    return value || need;
});
</script>

<template>
    <article class="char dual-rule">
        <header class="char-head">
            <div class="who-block">
                <div class="who">
                    <h2>{{ character.name }}</h2>
                    <span class="lv num">{{ character.level }} 级</span>
                    <!-- 门派空着就不挂签：一个新角色还没填门派，画一个空胶囊
                         比不画更像「这里坏了」。 -->
                    <span v-if="character.school" class="chip school">{{ character.school }}</span>
                </div>
                <p v-if="character.subs.length" class="meta char-sub">
                    <template v-for="(sub, i) in character.subs" :key="sub">
                        <span v-if="i > 0" class="dot">·</span>
                        <span>{{ sub }}</span>
                    </template>
                </p>
            </div>
            <!-- 卡头右侧：改与删。两枚都是纯图标 26px，与左栏、工具页同一种压印块。
                 删除的「确认」态把两枚换成一枚带字的朱面——那时它不是图标按钮，
                 而是一次已经亮明后果的动作，字必须写出来。 -->
            <div class="head-actions">
                <PressButton
                    v-if="pendingDelete"
                    icon="trash"
                    text="确认"
                    label="确认删除这个角色，无法撤销"
                    seal
                    @click="confirmDelete"
                />
                <template v-else>
                    <PressButton icon="edit" label="编辑这个角色" @click="emit('edit')" />
                    <PressButton icon="trash" label="删除这个角色" @click="askDelete" />
                </template>
            </div>
        </header>

        <SteppedSlider
            class="tabs"
            :model-value="active"
            :options="PANE_OPTIONS"
            as="tab"
            :prefix="character.id"
            :label="`${character.name} 的分区`"
            @update:model-value="choose"
        />

        <div class="char-body" @scroll="closeAll">
            <!-- ---------- 属性：五组，前四组两行两列（行优先），末组通栏 ---------- -->
            <section
                v-show="active === 'attrs'"
                :id="`${character.id}-pane-attrs`"
                class="pane"
                role="tabpanel"
                :aria-labelledby="`${character.id}-tab-attrs`"
            >
                <!-- 两行两列：上排资源 / 名望，下排战斗 / 加点。顺序来自数据
                     （`attrGroups`），这里只给网格——按列排会让下排两组被上一组的
                     长短拖着错位，按行排才能「上下两排各自顶对齐」。 -->
                <div class="attr-layout">
                    <div
                        v-for="group in character.attrGroups"
                        :key="group.title"
                        class="attr-group"
                        :class="{ wide: group.wide }"
                    >
                        <div class="group-head">
                            <span class="section-mark"></span>{{ group.title }}
                        </div>
                        <dl class="ledger paper-rows">
                            <div v-for="row in group.rows" :key="row.label" class="paper-row">
                                <dt>{{ row.label }}<span class="leader"></span></dt>
                                <!-- 空值画一个淡「—」，不画一片空白：一行里只有引导线和
                                     一个空档时，「没填」读起来像「值恰好很短」。 -->
                                <dd class="num" :class="{ strong: row.strong, blank: !row.value }">
                                    {{ row.value || '—' }}
                                </dd>
                            </div>
                        </dl>
                    </div>
                </div>

                <!-- 经验单独一行：它是这一屏唯一有分母的数（离下一级还有多远），
                     混在资源那五行里只是第六个数字。 -->
                <div class="exp-row">
                    <span class="group-head"><span class="section-mark"></span>经验</span>
                    <MeterBar :percent="expPercentValue" label="经验进度" :text="expText" />
                </div>
            </section>

            <!-- ---------- 师门 ---------- -->
            <section
                v-show="active === 'skills'"
                :id="`${character.id}-pane-skills`"
                class="pane"
                role="tabpanel"
                :aria-labelledby="`${character.id}-tab-skills`"
            >
                <!-- 名称在上、等级在下，照游戏「师门技能」面板那一列：
                     每一行是一行半（名称 + 等级小字），比「名称 …… 等级」的账页
                     更贴近屏幕上看到的样子，也给将来的技能图标留出左侧的位。 -->
                <div class="school-list">
                    <div
                        v-for="row in character.skills"
                        :key="row.name"
                        class="school-row"
                        :class="{ off: row.off }"
                    >
                        <span class="school-text">
                            <span class="name">{{ row.name }}</span>
                            <span
                                class="lv num"
                                :class="{ max: row.cap !== undefined && row.level >= row.cap }"
                            >
                                {{ row.level }}
                            </span>
                        </span>
                        <!-- 点线把「名字 + 等级」与右侧的签连起来。没有它，中间那片空白
                             读作「两列」，而这一页跟属性、召唤兽一样是一条一条的账。 -->
                        <span class="leader"></span>
                        <!-- 师门上限 180（用户 2026-11-02 确认）。知道上限才挂签，
                             不知道就不猜——`cap` 缺席时这一列留空。 -->
                        <span
                            v-if="row.cap !== undefined"
                            class="chip tag"
                            :class="{ on: row.level >= row.cap }"
                        >
                            {{ row.level >= row.cap ? '满' : `/${row.cap}` }}
                        </span>
                    </div>
                </div>
                <p v-if="character.skillFoot" class="hint foot">{{ character.skillFoot }}</p>
            </section>

            <!-- ---------- 辅助 ---------- -->
            <section
                v-show="active === 'assist'"
                :id="`${character.id}-pane-assist`"
                class="pane"
                role="tabpanel"
                :aria-labelledby="`${character.id}-tab-assist`"
            >
                <!-- 格子，照游戏「辅助技能」面板：一行四个，图标在上、等级在下。
                     生活技能与剧情技能合在同一张图里（游戏里就是同一个入口），
                     但等级下面那行小字把名字补上——图标是我们从截图切的，
                     用户认得图标，可这张表是拿来核对的，名字比图形可靠。 -->
                <div class="assist-groups">
                    <section v-for="group in assistGroups" :key="group.title" class="assist-group">
                        <!-- 两类必须各有小标题：生活技能练到 100+，剧情技能最高 5 级，
                             混在一张图里时「5」会被读成「才练了 5 级」。 -->
                        <div class="group-head">
                            <span class="section-mark"></span>{{ group.title }}
                        </div>
                        <div class="assist-grid">
                            <div
                                v-for="row in group.rows"
                                :key="`${row.kind}-${row.name}`"
                                class="assist-cell"
                                :class="{ off: row.off }"
                                :title="`${row.name} ${row.level}${row.cap ? `/${row.cap}` : ''}`"
                            >
                                <span class="assist-icon">
                                    <img v-if="iconOf(row)" :src="iconOf(row)" alt="" />
                                </span>
                                <span
                                    class="assist-lv num"
                                    :class="{
                                        max: row.cap !== undefined && row.level >= row.cap,
                                    }"
                                >
                                    {{ row.level }}
                                </span>
                                <span class="assist-name">{{ row.name }}</span>
                            </div>
                        </div>
                    </section>
                </div>
                <p v-if="character.assistFoot" class="hint foot">{{ character.assistFoot }}</p>
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
                <p v-if="character.trainingFoot" class="hint foot">{{ character.trainingFoot }}</p>
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
                        ><span class="v seal">{{ character.gearMeta.special || '—' }}</span></span
                    >
                    <span
                        ><span class="k">套装</span
                        ><span class="v ochre">{{ character.gearMeta.suit || '—' }}</span></span
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
                <p v-if="character.petFoot" class="hint foot">{{ character.petFoot }}</p>
            </section>
        </div>

        <GearTip :anchor="tipAnchor" :detail="gearTip" />
        <PetTip :anchor="tipAnchor" :pet="petTip" />
    </article>
</template>

<style scoped src="./character-card.css"></style>
