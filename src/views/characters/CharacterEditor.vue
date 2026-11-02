<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import NumberField from '../../components/NumberField.vue';
import PressButton from '../../components/PressButton.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import { PANES, type CharacterData, type PaneKey } from './character';
import AttrEditor from './editor/AttrEditor.vue';
import GearEditor from './editor/GearEditor.vue';
import PetEditor from './editor/PetEditor.vue';
import SkillEditor from './editor/SkillEditor.vue';
import TrainingEditor from './editor/TrainingEditor.vue';
import { normalizeCharacter } from './roster';

/**
 * 新增 / 修改角色的**一张纸**。
 *
 * 为什么是浮层而不是独立路由：名册是「三到五张卡并排」的一页，改的是其中一张，
 * 改完眼睛要能落回原来的位置；跳到另一个路由再跳回来，滚动位置、已展开的页签全丢了。
 *
 * 为什么不是卡内直接编辑：卡是 450 × 540 的固定格（同一行必须齐头齐脚），
 * 装不下 12 格装备 + 十来项技能；把卡临时拉宽，这一行的对齐就散了。
 *
 * ---- 草稿 ----
 * 打开时 `normalizeCharacter(character)` 深拷贝一份（它逐字段新建，天然是深拷贝），
 * 编辑期间只动草稿，**取消即丢弃**。保存时再 normalize 一次：
 * 空行、空装备壳、空召唤兽都在那一步被清掉（见 `roster.ts` 的说明），
 * 所以这里不需要另写一套「收尾」逻辑。
 *
 * ---- 脚注不在这里改 ----
 * 六个分区底下那句说明（`skillFoot` 等）是**给读卡的人看的文案**，不是角色数据：
 * 一个号的气血上限记不记当前值，不会因为它换了个号就变。新角色的这些字段为空，
 * 卡上就少一行说明——那正是它该有的样子，不补一句「请填写」。
 */
const props = defineProps<{ character: CharacterData; isNew: boolean }>();
const emit = defineEmits<{ save: [character: CharacterData]; cancel: [] }>();

const draft = ref<CharacterData>(normalizeCharacter(props.character));
const pane = ref<PaneKey>('attrs');

const PANE_OPTIONS = PANES.map((item) => ({ value: item.key, label: item.label }));

const title = computed(() =>
    props.isNew ? '新角色' : `编辑 · ${props.character.name || '未命名'}`,
);

/* 名字是唯一的必填项：卡片、页签、浮片全拿它当标识，空名字的卡在名册里
 * 就是一张读不出是谁的白纸。其余字段一律可以先空着，慢慢补。 */
const trimmedName = computed(() => draft.value.name.trim());
const canSave = computed(() => trimmedName.value.length > 0);

function save() {
    if (!canSave.value) return;
    draft.value.name = trimmedName.value;
    emit('save', normalizeCharacter(draft.value));
}

/* ---------- 键盘：Esc 关，Tab 关在这张纸里 ----------
 * 这是一个 `aria-modal` 的浮层，底下的名册仍在 DOM 里。不做焦点环的话，
 * Tab 会走到被遮住的卡片上——看得见的焦点停在看不见的东西上，是键盘用户最容易迷路的一种。
 */
const panel = ref<HTMLElement | null>(null);
const nameInput = ref<HTMLInputElement | null>(null);

const FOCUSABLE =
    'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
        event.preventDefault();
        emit('cancel');
        return;
    }
    if (event.key !== 'Tab' || !panel.value) return;

    /* 分区是 `v-show`：切走的那几块仍在 DOM 里，只是 `display: none`。
     * 不过滤就会把焦点送进看不见的输入框——`offsetParent` 是判「此刻是否可见」最省事的依据。 */
    const items = [...panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (item) => item.offsetParent !== null,
    );
    if (!items.length) return;

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
    } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
    }
}

/* 浮层打开期间锁住底下的滚动：滚轮能滚到名册上，会让人以为浮层在跟着动。
 * 记下原值再恢复，不写死成 `''`——将来别处也锁滚动时，两层叠着不会互相把对方的值冲掉。 */
let previousOverflow = '';

onMounted(async () => {
    document.addEventListener('keydown', onKeydown);
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    await nextTick();
    nameInput.value?.focus();
});

onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown);
    document.body.style.overflow = previousOverflow;
});

/* 副标题（服务器 · 帮派 · 更新时间）在卡上是三点分隔的一行小字，
 * 在表单里按「每行一条」编辑：换行比逗号更像一个列表，也不会与地名里的顿号打架。 */
function readLines(event: Event): string[] {
    return (event.target as HTMLTextAreaElement).value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
}
</script>

<template>
    <div class="editor-mask">
        <section
            ref="panel"
            class="editor frame"
            role="dialog"
            aria-modal="true"
            :aria-label="title"
        >
            <header class="editor-head">
                <div class="head-text">
                    <h2 class="editor-title">{{ title }}</h2>
                    <p class="meta">
                        {{ isNew ? '名字填了就能先存下，其余随时补' : '改完点保存才落账' }}
                    </p>
                </div>
                <div class="head-acts">
                    <PressButton text="取消" label="放弃这次修改" @click="emit('cancel')" />
                    <PressButton
                        icon="check"
                        text="保存"
                        label="保存这个角色"
                        seal
                        :disabled="!canSave"
                        @click="save"
                    />
                </div>
            </header>

            <div class="editor-base">
                <div class="form-row">
                    <span class="field-label">名字</span>
                    <input
                        ref="nameInput"
                        v-model="draft.name"
                        class="field name-input"
                        aria-label="角色名"
                        placeholder="游戏里的角色名"
                    />
                    <span class="field-label">等级</span>
                    <NumberField
                        :model-value="draft.level"
                        label="等级"
                        class="level-input"
                        @update:model-value="draft.level = $event"
                    />
                    <span class="field-label">门派</span>
                    <input
                        v-model="draft.school"
                        class="field school-input"
                        aria-label="门派"
                        placeholder="五庄观"
                    />
                </div>
                <div class="form-row sub-row">
                    <span class="field-label">副题</span>
                    <textarea
                        class="field area sub-input"
                        rows="2"
                        aria-label="副题，每行一条"
                        placeholder="陕西区 · 大雁塔&#10;帮派 大唐芙蓉园&#10;今天 14:48"
                        :value="draft.subs.join('\n')"
                        @change="draft.subs = readLines($event)"
                    />
                </div>
            </div>

            <SteppedSlider
                class="editor-tabs"
                :model-value="pane"
                :options="PANE_OPTIONS"
                as="tab"
                prefix="editor"
                label="编辑分区"
                @update:model-value="pane = $event"
            />

            <div class="editor-body">
                <section
                    v-show="pane === 'attrs'"
                    id="editor-pane-attrs"
                    role="tabpanel"
                    aria-labelledby="editor-tab-attrs"
                >
                    <AttrEditor v-model="draft.attrGroups" v-model:experience="draft.experience" />
                </section>

                <section
                    v-show="pane === 'skills'"
                    id="editor-pane-skills"
                    role="tabpanel"
                    aria-labelledby="editor-tab-skills"
                >
                    <SkillEditor v-model="draft.skills" />
                </section>

                <section
                    v-show="pane === 'assist'"
                    id="editor-pane-assist"
                    role="tabpanel"
                    aria-labelledby="editor-tab-assist"
                >
                    <SkillEditor v-model="draft.assists" kind="assist" />
                </section>

                <section
                    v-show="pane === 'training'"
                    id="editor-pane-training"
                    role="tabpanel"
                    aria-labelledby="editor-tab-training"
                >
                    <TrainingEditor v-model="draft.trainings" />
                </section>

                <section
                    v-show="pane === 'gear'"
                    id="editor-pane-gear"
                    role="tabpanel"
                    aria-labelledby="editor-tab-gear"
                >
                    <GearEditor v-model="draft.gear" />
                </section>

                <section
                    v-show="pane === 'pets'"
                    id="editor-pane-pets"
                    role="tabpanel"
                    aria-labelledby="editor-tab-pets"
                >
                    <PetEditor v-model="draft.pets" />
                </section>
            </div>
        </section>
    </div>
</template>

<style scoped>
/* 遮罩用**不变的暗**（`--ink-base`），不是 `--ink`：后者在暗色主题下是纸白，
 * 混出来的「半透明黑」会变成一层白雾，把底下的名册蒙亮。 */
.editor-mask {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: grid;
    place-items: center;
    padding: var(--page-pad);
    /* 58% 而不是 42%：更浅的那一档在亮色下只剩一层薄灰，底下的名册照样看得清，
     * 浮层与它分不开。58% 之后纸被压暗一档，而面板仍是纸白——「这张纸盖在
     * 名册上」才读得出来。 */
    background: color-mix(in srgb, var(--ink-base) 58%, transparent);
}

/* 高度 `min(760px, 100%)`：760 是「1280 × 820 窗口里上下各留 30」的余量，
 * 到了小窗口就压到可视区内，永远不需要整页滚。三段（头 / 分区 / 内容）里
 * 只有内容区滚，页签条始终在视线里。
 *
 * 是 `height` 不是 `max-height`：用 max- 时面板跟着内容长短伸缩，切一个页签
 * 整张纸就上下跳一次——一个装了六个分区的窗口，不该随「这一页有几行」改变大小。 */
.editor {
    display: flex;
    flex-direction: column;
    /* 656 = 622（内容区，与 720 时期一模一样）+ 2 × 16（四周留白）+ 2（左右边框）。
     * 2026-11-02 第二版：先前是 720 宽的纸、内部左右各收 48，结果一笔账读出来是
     * 「弹窗很宽、内容挤在中间」，四周的留白还不一样（左右 48、上下 14/16）。
     * 现在把留白还给外框——**内容宽度一分没变**，只是纸窄了 64，四边统一 16。
     * 改宽度时先反算这个等式：内容宽 = 宽 − 2（边框）− 2 × `--editor-pad-x`。 */
    width: min(656px, 100%);
    height: min(760px, 100%);
    padding: 0;
    overflow: hidden;
    box-shadow: var(--shadow-lift);
    /* 整张纸只有一个留白基准：页头、基本信息、页签条、内容区四段都引它，
     * 所以「名字」的标签、页签条左缘、属性组头竖条、纸带左缘落在同一条竖线上，
     * 四边的呼吸也一致。各处各写一个数必然有一处忘改——卡上 `--card-pad-x`
     * 踩过同一个坑。 */
    --editor-pad-x: 16px;
}

.editor-head {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    flex: none;
    padding: 16px var(--editor-pad-x) 10px;
}
.head-text {
    min-width: 0;
}
.editor-title {
    font-size: var(--fs-md);
    line-height: 1.3;
    letter-spacing: 0.06em;
}
.head-text .meta {
    margin-top: 2px;
}
.head-acts {
    display: flex;
    gap: 6px;
    margin-left: auto;
}

/* 基本信息与分区条之间那条账线：与页头同一条（`--w-hair` 实线），
 * 它把「这个号是谁」与「这个号有什么」分开。 */
.editor-base {
    flex: none;
    padding: 0 var(--editor-pad-x) 12px;
    border-bottom: var(--w-hair) solid var(--rule-2);
}
.sub-row {
    align-items: flex-start;
    margin-top: 8px;
}
.sub-row .field-label {
    padding-top: 5px;
}
.name-input {
    flex: 1;
    min-width: 120px;
}
.level-input {
    width: 66px;
}
.school-input {
    width: 120px;
}
.sub-input {
    flex: 1;
    min-width: 0;
}

.editor-tabs {
    flex: none;
    margin: 12px var(--editor-pad-x) 0;
    /* 与卡内页签同高（`--step-pad-y: 6px` → 格子 29、整条 35，实测）：同一枚控件在两处出现，
     * 一薄一厚会读成两个不同年代的版本。横向不收紧——这里每格 102.7，够宽。 */
    --step-pad-y: 6px;
}

/* 内容区是唯一滚动的一段。`scrollbar-gutter: stable` 与卡内正文同一条理由：
 * 六个分区的内容长短不一，滚动条一出现一消失，整页文字会左右跳。 */
.editor-body {
    flex: 1;
    min-height: 0;
    /* 左右这个基准与上面三段同一个变量：属性页的网格不再自己加留白，
     * 六个页签的内容左缘因此对齐到同一条线。
     *
     * 右内边距要减掉一条滚动条轨道（`--scrollbar-w`，与 `::-webkit-scrollbar`
     * 同源）：`scrollbar-gutter: stable` 把轨道算在内边距里，不减的话内容区
     * 恒比页签条窄 10px，右端纸带的边会比页签条的边往里缩一截——左对齐做完，
     * 右错位反而更显眼。base.css 的页面容器用的是同一手法。 */
    padding: 12px max(0px, calc(var(--editor-pad-x) - var(--scrollbar-w))) 16px var(--editor-pad-x);
    overflow: auto;
    scrollbar-gutter: stable;
}
</style>
