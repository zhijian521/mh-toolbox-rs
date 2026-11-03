<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import NumberField from '../../components/NumberField.vue';
import PressButton from '../../components/PressButton.vue';
import SelectField from '../../components/SelectField.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import { PANES, type CharacterData, type PaneKey } from './character';
import AttrEditor from './editor/AttrEditor.vue';
import GearEditor from './editor/GearEditor.vue';
import PetEditor from './editor/PetEditor.vue';
import SkillEditor from './editor/SkillEditor.vue';
import TrainingEditor from './editor/TrainingEditor.vue';
import { schoolNames } from '../../services/game-data';
import { normalizeCharacter, defaultSchool } from './roster';
import { schoolSkillNames, schoolSkills } from './schools';

/**
 * 新增 / 修改角色的**一张纸**。
 *
 * 为什么是浮层而不是独立路由：名册是「三到五张卡并排」的一页，改的是其中一张，
 * 改完眼睛要能落回原来的位置；跳到另一个路由再跳回来，滚动位置、已展开的页签全丢了。
 *
 * 为什么不是卡内直接编辑：卡是 450 × 620 的固定格（同一行必须齐头齐脚），
 * 装不下 12 格装备 + 十来项技能；把卡临时拉宽，这一行的对齐就散了。
 *
 * ---- 草稿 ----
 * 打开时 `normalizeCharacter(character)` 深拷贝一份（它逐字段新建，天然是深拷贝），
 * 编辑期间只动草稿，**取消即丢弃**。保存时再 normalize 一次：
 * 空行、空装备壳、空召唤兽都在那一步被清掉（见 `roster.ts` 的说明），
 * 所以这里不需要另写一套「收尾」逻辑。
 *
 * ---- 卡上没有页脚 ----
 * 六个分区底下原先各有一句说明（`assistFoot` / `trainingFoot` / `petFoot`），
 * 2026-11-03 用户要求全部删掉：它们是手抄的注脚，这里从来就没有入口能改。
 * 所以草稿里也不再有任何「说明」类字段——表单只收游戏面板上真有的东西。
 */
const props = defineProps<{ character: CharacterData; isNew: boolean }>();
const emit = defineEmits<{ save: [character: CharacterData]; cancel: [] }>();

const draft = ref<CharacterData>(normalizeCharacter(props.character));
const pane = ref<PaneKey>('attrs');

const PANE_OPTIONS = PANES.map((item) => ({ value: item.key, label: item.label }));

const title = computed(() =>
    props.isNew ? '新角色' : `编辑 · ${props.character.name || '未命名'}`,
);

/* ---------- 门派决定门派技能 ----------
 * 选门派就把七项技能名带进来（表在 `game/data/schools.json`，规则在 `schools.ts`），
 * 用户只需要填等级。
 *
 * 为什么不是「选完再手动加七行」：那七项是**游戏按门派给你的**，不是自选题。
 * 让用户照着面板一个字一个字敲，既慢又必然敲错同音字（「潇湘仙雨」这类），
 * 而名字错一项，卡上就少一项、图标也查不到。
 *
 * 换门派时**按名字保留已录的等级**（`schoolSkills` 的第二个参数）：转门派之后
 * 练过的等级大多跟着走；即使用户只是先选错再选对，清掉他刚填的数字也是最难受的意外。
 */
function onSchool(school: string) {
    draft.value.school = school;
    draft.value.skills = schoolSkills(school, draft.value.skills);
}

/* 选项表：二十一门派，**没有「未选」**（2026-11-03 用户要求）。
 *
 * 门派对这一页不是可选装饰：它决定下面那七项技能，留一个空值就是一个选不回来的状态
 * ——下拉里选不回去，卡上也读不出「这个人没门派」。默认值由 `emptyCharacter()` 给，
 * 这里只负责把老数据里的空门派补上（见下面那两行）。
 *
 * 表外的门派（手输留下的老数据）先占一项：不补的话那一项显示成「选择门派」，
 * 看起来像门派被改没了。 */
const schoolOptions = computed(() => {
    const options: { value: string; label: string }[] = [];
    const current = draft.value.school;
    if (current && !schoolSkillNames(current)) {
        options.push({ value: current, label: `${current}（不在表里）` });
    }
    for (const name of schoolNames()) options.push({ value: name, label: name });
    return options;
});

/* 打开一张**空门派、空技能**的纸（老存档，或游戏表没加载上）：落默认门派。
 * 与「新角色」同一条默认值——下拉里已经没有「未选」，空着就是一个选不回来的状态。
 *
 * 有技能却没门派的老号**不补**：它的七项可能是上一版手输的，硬安一个门派等于替它
 * 认了个错的门派。那种号让用户自己在第一屏选一次，选中即重算。 */
if (!draft.value.school && !draft.value.skills.length) {
    draft.value.school = defaultSchool();
}

/* 打开一个「有门派、但技能是空的」旧号时补一次：不是覆盖，是把它本来就该有的
 * 七项补上。已经有技能的号一律不动——那可能是用户自己录的。 */
if (!draft.value.skills.length && draft.value.school) {
    draft.value.skills = schoolSkills(draft.value.school);
}

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
                    <!-- 只有新增时留一句提示。编辑态原先那行「改完点保存才落账」已删：
                         保存按钮就在右侧、通篇只有一个出口，再说一遍等于解释显而易见的
                         事——而这句话占的是页头唯一的副标题位。 -->
                    <p v-if="isNew" class="meta">名字填了就能先存下，其余随时补</p>
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

            <!-- 基本信息两排：上排「名字 : 等级 : 门派 = 2 : 1 : 1」，下排「区服 : 帮派 = 1 : 1」。
                 用一枚 grid 而不是两条 `.form-row`：比例说的是**列宽**，而 flex 里
                 「名字 flex: 1 + 两个定宽」只在某一档窗口宽度下碰巧对，窄一档就散；
                 两排各写一次列宽，加起来也未必等于整条的等分。
                 **四等份列**：上排 2 + 1 + 1，下排 2 + 2，全部落在同一组四等份上。 -->
            <div class="editor-base">
                <div class="base-grid">
                    <label class="base-cell span-2">
                        <span class="field-label">名字</span>
                        <input
                            ref="nameInput"
                            v-model="draft.name"
                            class="field"
                            aria-label="角色名"
                            placeholder="游戏里的角色名"
                        />
                    </label>
                    <label class="base-cell">
                        <span class="field-label">等级</span>
                        <NumberField
                            :model-value="draft.level"
                            label="等级"
                            @update:model-value="draft.level = $event"
                        />
                    </label>
                    <label class="base-cell">
                        <span class="field-label">门派</span>
                        <!-- 下拉而不是手输：门派是二十一个固定值，手输的「五庄观」
                             只要有一个字不一样，就带不出门派技能（也就白选了）。
                             选中即重算技能表——见 `onSchool`。 -->
                        <SelectField
                            :model-value="draft.school"
                            :options="schoolOptions"
                            label="门派"
                            placeholder="选择门派"
                            @update:model-value="onSchool"
                        />
                    </label>
                    <label class="base-cell span-2">
                        <span class="field-label">区服</span>
                        <input
                            v-model="draft.server"
                            class="field"
                            aria-label="区服"
                            placeholder="陕西区 · 大雁塔"
                        />
                    </label>
                    <label class="base-cell span-2">
                        <span class="field-label">帮派</span>
                        <input
                            v-model="draft.guild"
                            class="field"
                            aria-label="帮派"
                            placeholder="大唐芙蓉园"
                        />
                    </label>
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
                    <SkillEditor v-model="draft.skills" fixed-names :school="draft.school" />
                </section>

                <!-- 辅助技能与剧情技能**上下两块**，与卡片那一页同一读法（2026-11-03 用户：
                     「编辑页面也同步修改为上下两部分」）。两个 `SkillEditor` 绑的是**同一个**
                     `draft.assists`，各自只显示自己那一类——分成两个数组要改存档结构，
                     而存档里「一类」本来就是每行的一个字段。 -->
                <section
                    v-show="pane === 'assist'"
                    id="editor-pane-assist"
                    role="tabpanel"
                    aria-labelledby="editor-tab-assist"
                >
                    <div class="assist-block">
                        <div class="group-head"><span class="section-mark"></span>生活技能</div>
                        <SkillEditor v-model="draft.assists" kind="assist" group="life" />
                    </div>
                    <div class="assist-block">
                        <div class="group-head"><span class="section-mark"></span>剧情技能</div>
                        <SkillEditor v-model="draft.assists" kind="assist" group="story" />
                    </div>
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
/* 编辑页的读数与卡上同一个字重（2026-11-03 用户：「编辑页面里面的数字也同步加粗」）。
 *
 * 一条 `.num` 就够：属性值、经验、技能等级与上限、修炼上限、召唤兽资质全挂在
 * `NumberField` 或 `.num` 上（`NumberField` 的根 input 自己带 `num`）。装备编辑里
 * 全是文本——装备名、类型、条件、属性行——名字与区服帮派也是文本，它们不该跟着粗。
 *
 * 五个编辑器是子组件，够不着 scoped，所以走 `:deep()`。与 `character-card.css`
 * 那条同义：卡上是「读到的数」，这里是「填进去的数」，同一个字重才不显得一个系统里
 * 有两种数字。 */
.editor :deep(.num) {
    font-weight: 700;
}

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
/* **四等份列**：上排「名字 2 份 + 等级 1 份 + 门派 1 份」，下排「区服 2 份 + 帮派 2 份」。
 *
 * 写 `repeat(4, 1fr)` 而不是 `2fr 1fr 1fr`（2026-11-03 修）：后者只是**三**条轨道，
 * 跨两格的「名字」拿到的是「2fr + 1fr」= 整条的 3/4，等级只剩 1/4；门派占第 3 条轨道、
 * 区服跨不到第 4 条，于是被挤到下一行——弹出来是三排（名字 + 等级 / 门派 + 区服 / 帮派）。
 * 四等份之后，2 + 1 + 1 与 2 + 2 都正好铺满一整条。 */
.base-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px 12px;
}
/* 一格 = 标签 + 输入格，标签在左、与全站其它表单行同一个姿势（§2.4 的 `.form-row`）。
 * 用 `<label>` 包住：点标签就等于点输入格，四格的点击面积都比一格输入框大。 */
.base-cell {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
}
.base-cell.span-2 {
    grid-column: span 2;
}
/* 输入格吃掉本格剩下的宽度：不给它就按 `size` 属性的默认宽度走，
 * 2:1:1 的列宽关系立刻作废（`.field` 的 `min-width: 0` 已在全站给过）。 */
.base-cell .field {
    flex: 1;
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

/* 辅助 / 剧情两块之间用一条账线隔开，与卡上那一页同一个说法（那里也是
 * `border-top` + 留白）。只靠留白的话，弹窗里两段自由列表读起来只是「隔得远了点」，
 * 而它们是两类不同的尺子——生活技能练到 100+，剧情技能最高 5 级。 */
.assist-block + .assist-block {
    margin-top: 18px;
    padding-top: 16px;
    border-top: var(--w-hair) solid var(--rule);
}
/* 辅助那两块的组头与卡上同一个器件（`base.css` 的 `.group-head`）；
 * 这一页只在它下面多留 8px——那一块接的是一列会增删的行，不是一叠纸带。 */
.assist-block .group-head {
    --gh-mb: 8px;
}
</style>
