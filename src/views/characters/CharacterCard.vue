<script setup lang="ts">
import PaperCard from '../../components/PaperCard.vue';
import { computed, ref, watch } from 'vue';
import PressButton from '../../components/PressButton.vue';
import NumberField from '../../components/NumberField.vue';
import SelectField from '../../components/SelectField.vue';
import { withCurrentOption } from '../../components/select-options';
import { schoolNames } from '../../services/game-data';
import SteppedSlider from '../../components/SteppedSlider.vue';
import GearTip from './GearTip.vue';
import AssistPane from './panes/AssistPane.vue';
import AttrPane from './panes/AttrPane.vue';
import GearPane from './panes/GearPane.vue';
import PetPane from './panes/PetPane.vue';
import SkillPane from './panes/SkillPane.vue';
import TrainingPane from './panes/TrainingPane.vue';
import {
    PANE_OPTIONS,
    type AssistKind,
    type AssistSkill,
    type CharacterData,
    type PaneKey,
} from './character';
import type { GearDetail, GearSlotName } from './gear';
import type { QuickTarget } from './quick/quick-target';

/**
 * 一张角色卡：**一张纸上的六个分区**，用卡内页签切换。
 *
 * 为什么不是「侧边竖排按钮 + 一张长卡」：卡宽只有 420，侧栏一挤就变成第三列；
 * 而且名册一行要放两张，切换控件只能收进卡内。
 *
 * 为什么卡高写死 620（`--char-h`）：同一行的卡必须**齐头齐脚**，否则第二行会被最高那张顶歪。
 * 代价是内容少的分区（召唤兽）底下会空一块——那里就只是留白，不再压一句页脚说明
 * （2026-11-03 用户要求删掉卡片上所有手抄的注脚）。
 *
 * 六个页签均分卡宽：`(420 − 40 − 4) / 6 ≈ 62.7` 一格，扣掉格内两侧 8 的留白得
 * 54.7；最长的「召唤兽」三个字在 1.1 字号档约 46（`--fs-base` 13.5 × 1.1 × 3 +
 * 字距），余 8.7。卡宽一改就要重算这个数，**仍是六格封顶**——再加第七个得改文案
 * 或改成两行。
 *
 * 页签里的「凹槽 + 选中灌朱」不在这里重写：它是 `SteppedSlider` 的 `as="tab"`——
 * 六格等分、印按格位移、方向键换页签全在那边，本组件只给它 `options` 与 `prefix`。
 * 早先这里是六个 `.bevel-pill`（各自一枚按钮，选中即灌朱），换掉的理由不是好看：
 * 六个胶囊在同一块板上读作「六个独立开关」，而它们实际是**一条轨道上的六个落点**。
 *
 * 装备**格子**不再是 `PressTile`（2026-11-04 随 4 × 4 重排改）：那块凸起的纸读作
 * 「已经拿出来摆着的一件东西」，而格子是「往里放」的槽，凹才对。现在用全局 `.well`
 * 的四件套，与页签那条轨道同一个光向。**格子里的图标仍是一块压印块**（`IconTile`，
 * 与师门、辅助同款）：凹说的是「这是个位置」，凸说的是「位置上放着一件」。
 *
 * ---- 六个分区各是一个组件（2026-11-05 拆） ----
 * 这张卡原本 561 行模板 + 982 行样式装六个分区，改哪一页都要在同一份文件里翻。
 * 现在 `panes/` 下六个文件各自带一份 `scoped` 样式，模板跟着样式一起搬——
 * 父组件的 `scoped` 够不到子组件的内部元素，所以两者必须同进同退。
 *
 * 留在本文件里的只有卡的壳与装备浮片。召唤兽与装备格共用页面的快速修改入口，
 * 点开即在同一窗口里看详情、截图识别与修改。
 *
 * ---- `preview`：同一张卡，没有动作区 ----
 * 截图识别的弹窗右边要展示「识别之后的样子」，用的就是这张卡。那一份不能有
 * 「修改 / 删除」——它是一张预览，点它会去动一张还没落库的草稿。
 * 单独加一个布尔而不是在父级用 CSS 藏：`v-if` 才是「这里不该有按钮」，
 * 隐藏动作区也不该保留可聚焦的控件。
 *
 * ---- `editable`：同一张卡，读数变成格子 ----
 * 预览那份还要**能改**：认错的数就摆在卡上，让人在看得见后果的地方改，而不是
 * 在左栏另一套输入格里改完再回头看卡。属性、师门、辅助与修炼都可直接编辑，
 * 固定项目清空数值，辅助可增删行；各分区抛出修改，本组件转给外层草稿。
 *
 * ---- `tabs`：连页签条一起省掉 ----
 * 「只展示这一页」的用法（截图识别弹窗右边）不该长出一条六个页签的轨道：那是一句
 * 「你可以去别的页」的邀请，而那张卡是预览，别处看了也没意义。关掉之后其余五个分区
 * **不渲染**（不是隐藏）——`v-show` 留着它们的前提是「切回来不丢滚动位置」，
 * 没有页签可切，那个前提不成立。`AttrPane` 同时从 `tabpanel` 降级成 `region`，
 * 见那边的 `tabbed`。
 *
 * ---- `pane`：外面指定看哪一页 ----
 * 截图识别认的是哪一类面板，右边就该显示哪一页（认师门技能却停在属性页，
 * 用户得自己点过去找刚认出来的数）。**只是初值与跟随**：页签还能点，
 * 内部 `active` 变了不会被父级弹回去——父级只在它自己换值时下发。
 *
 * ---- `quick`：点哪一项就改哪一项 ----
 * 名册里那张卡上，属性行、技能行、修炼行、辅助行、装备格子都是「快速修改」的入口
 * （`quick/QuickEdit.vue`）。卡片不自己开窗：它把「点了什么」抛上去（`quick` 事件），
 * 由 `CharactersView` 找到对应角色开窗、保存时走 `update()`。理由与删除确认同一条——
 * 弹窗的开关状态属于页面，卡是循环渲染的，存一份就变成「每张卡各有一个窗」。
 *
 * 截图识别右侧的卡直接编辑草稿，不开快速修改窗；`quick` 由名册传入，默认关闭。
 */
const props = withDefaults(
    defineProps<{
        character: CharacterData;
        preview?: boolean;
        editable?: boolean;
        tabs?: boolean;
        /** 要显示哪一页。缺省是属性页；父级改值时跟随。 */
        pane?: PaneKey;
        /** 点行 / 格开「快速修改」。 */
        quick?: boolean;
        disabled?: boolean;
    }>(),
    /* `tabs` 的缺省值**必须显式写 `true`**：Vue 对布尔 prop 的缺省是 `false` 而不是
     * `undefined`（Boolean casting），所以模板里写 `props.tabs !== false` 不管用——
     * 不传时它已经是 `false` 了，整张名册的页签条会被一起省掉（这一条当场红过）。
     * `preview` / `editable` / `quick` 用不到反直觉的缺省，不写。 */
    { tabs: true, pane: 'attrs', quick: false },
);
const emit = defineEmits<{
    edit: [pane: PaneKey];
    remove: [];
    'edit-value': [key: string, value: string];
    'edit-level': [name: string, level: number];
    'edit-assist': [index: number, patch: Partial<AssistSkill>];
    'add-assist': [kind: AssistKind];
    'remove-assist': [index: number];
    'edit-training': [name: string, level: number];
    quick: [target: QuickTarget];
}>();

const active = ref<PaneKey>(props.pane);
watch(
    () => props.pane,
    (next) => {
        active.value = next;
    },
);

const schoolOptions = computed(() =>
    withCurrentOption(
        schoolNames().map((name) => ({ value: name, label: name })),
        props.character.school,
    ),
);
function editIdentity(key: string, event: Event) {
    emit('edit-value', key, (event.target as HTMLInputElement).value);
}

function choose(key: PaneKey) {
    active.value = key;
    closeAll();
}

/* 删除不在这里问第二遍：卡只管画，问句与后果在 `CharactersView` 里走全站那枚 `askConfirm()`。
 * 卡上再自绘一套「按钮就地改名 → 4 秒退回」，就有两个入口、两套文案，
 * 而且「4 秒」这种时限只有这一个地方有，谁也说不清为什么是 4 秒。 */

/* ---------- 浮片：只剩装备一份 ----------
 * 悬停/聚焦 → 量锚点 → 由浮片自己算落位。锚点存 rect 而不是元素：滚动或重建之后
 * rect 就过期了，存元素会让浮片停在旧位置。
 *
 * 召唤兽的那一份（`PetTip`）2026-11-05 退役：它给的是「资质 + 八项属性 + 技能名 +
 * 内丹名」，与详情档案整块重合。同一份内容两个出口，改了一处另一处就静默过期
 * （`GearTip` 的注释里写着同一件事：两处各写一遍，抄到第二遍时就已经漂了）。
 * 现在兽是**点开看详情**，悬停不再停 90ms 才出东西——那一页本来就要点。
 */
const tip = ref<GearDetail | null>(null);
const tipAnchor = ref<DOMRect | null>(null);
const tipSlot = ref<GearSlotName>();

/* 装备页抛上来的是**量好的 rect**，不是事件：`getBoundingClientRect()` 得在事件
 * 当时同一帧取，隔着一次 emit 再去读 `event.currentTarget` 可能已经是空的。 */
function showTip(payload: { anchor: DOMRect; detail: GearDetail; slotName: GearSlotName }) {
    tipAnchor.value = payload.anchor;
    tip.value = payload.detail;
    tipSlot.value = payload.slotName;
}

function closeAll() {
    tip.value = null;
    tipAnchor.value = null;
}

function openDetail(index: number) {
    closeAll();
    if (props.quick && props.character.pets[index]) emit('quick', { kind: 'pet', index });
}

/* 经验条的两个值、生活/剧情分组、十二格的坐标与图标、召唤兽牌的取数，
 * 都跟着各自的分区搬进了 `panes/`——那里才有用到它们的那份模板。 */
</script>

<template>
    <!-- `data-school` 给浅染用（`blocks.css` 的共用门派映射）。
         空门派时属性为空串，不匹配任何一条 → 卡底回落纸色。
         原先还挂着 `dual-rule`（离卡缘 3px 的一圈 1px 内衬线），2026-11-06
         用户要求「最外面的一圈细边框去掉」——卡边只剩纸自己的棱与落影。 -->
    <PaperCard
        as="article"
        :id="editable || preview ? undefined : 'character-' + character.id"
        tabindex="-1"
        :aria-label="character.name || '未命名角色'"
        class="char character-theme"
        :data-school="character.school || ''"
    >
        <header class="char-head">
            <div class="who-block" :class="{ 'identity-edit': editable && active === 'attrs' }">
                <div v-if="editable && active === 'attrs'" class="who who-edit">
                    <input
                        class="field identity-name"
                        :value="character.name"
                        aria-label="角色名"
                        required
                        :aria-invalid="!character.name.trim()"
                        placeholder="名称"
                        @input="editIdentity('name', $event)"
                    />
                    <NumberField
                        update-on-input
                        class="identity-level num-slot"
                        :model-value="character.level"
                        label="角色等级"
                        zero-as-empty
                        @update:model-value="emit('edit-value', 'level', String($event))"
                    />
                    <SelectField
                        class="identity-school"
                        :model-value="character.school"
                        :options="schoolOptions"
                        label="角色门派"
                        placeholder="门派"
                        @update:model-value="emit('edit-value', 'school', $event)"
                    />
                </div>
                <div v-else class="who">
                    <h2>{{ character.name }}</h2>
                    <span class="lv num">{{ character.level }} 级</span>
                    <!-- 门派空着就不挂签：一个新角色还没填门派，画一个空胶囊
                         比不画更像「这里坏了」。 -->
                    <span v-if="character.school" class="chip school">{{ character.school }}</span>
                </div>
                <!-- 名字下面那行小字：区服 · 帮派。两项各自 `v-if`，
                     只填了一项时不是「A · 」，也不会留下一个空的点。 -->
                <div v-if="editable && active === 'attrs'" class="identity-sub">
                    <input
                        class="field"
                        :value="character.server"
                        aria-label="区服"
                        placeholder="区服"
                        @input="editIdentity('server', $event)"
                    />
                    <input
                        class="field"
                        :value="character.guild"
                        aria-label="角色帮派"
                        placeholder="帮派"
                        @input="editIdentity('guild', $event)"
                    />
                </div>
                <p v-else-if="character.server || character.guild" class="meta char-sub">
                    <span v-if="character.server">{{ character.server }}</span>
                    <span v-if="character.server && character.guild" class="dot">·</span>
                    <span v-if="character.guild">{{ character.guild }}</span>
                </p>
            </div>
            <!-- 卡头右侧：改与删。两枚都是纯图标 26px，与左栏、工具页同一种压印块。
                 删除只把事件抛出去，确认窗由名册页开——卡上不出现第二种「确认」的问法。 -->
            <div v-if="!preview" class="head-actions">
                <PressButton
                    icon="edit"
                    label="编辑这个角色"
                    :disabled="disabled"
                    @click="emit('edit', active)"
                />
                <PressButton
                    danger
                    icon="trash"
                    label="删除这个角色"
                    :disabled="disabled"
                    @click="emit('remove')"
                />
            </div>
        </header>

        <SteppedSlider
            v-if="props.tabs"
            class="tabs"
            :model-value="active"
            :options="PANE_OPTIONS"
            as="tab"
            :prefix="character.id"
            :label="`${character.name} 的分区`"
            @update:model-value="choose"
        />

        <div class="char-body" @scroll="closeAll">
            <!-- 六个分区各是一个组件，`id` 与 `aria-labelledby` 由这里给：
                 它们要与页签条那枚按钮的 `-tab-xxx` 同名，而页签是这一层画的
                 （`SteppedSlider` 的 `prefix`）。`v-show` 也挂在这一层——
                 六个分区要一直挂载着，切回来才不会丢掉滚动位置。
                 分区根元素是 `<section class="pane">`，它的 `role="tabpanel"`
                 由组件自己带。

                 没有页签条时（`tabs: false`）这一层的三条约定一起失效：没有 `-tab-xxx`
                 可指、没有「切回来」这回事、`tabpanel` 也不该出现。所以当前那一页改挂
                 `aria-label` 并把 `tabbed` 关掉，其余页**不渲染**。
                 属性、师门、辅助、修炼按 `pane` 挂载预览，其余页只在名册页签里出现。 -->
            <template v-if="props.tabs || active === 'attrs'">
                <AttrPane
                    v-show="active === 'attrs'"
                    :id="`${character.id}-pane-attrs`"
                    :aria-labelledby="props.tabs ? `${character.id}-tab-attrs` : undefined"
                    :aria-label="props.tabs ? undefined : '属性'"
                    :tabbed="props.tabs"
                    :groups="character.attrGroups"
                    :experience="character.experience"
                    :editable="editable"
                    :quick="quick"
                    @edit-value="(key, value) => emit('edit-value', key, value)"
                    @quick="(target) => emit('quick', target)"
                />
            </template>

            <template v-if="props.tabs || active === 'skills'">
                <SkillPane
                    v-show="active === 'skills'"
                    :id="`${character.id}-pane-skills`"
                    :aria-labelledby="props.tabs ? `${character.id}-tab-skills` : undefined"
                    :aria-label="props.tabs ? undefined : '师门'"
                    :rows="character.skills"
                    :editable="editable"
                    :tabbed="props.tabs"
                    :quick="quick"
                    @edit-level="(name, level) => emit('edit-level', name, level)"
                    @quick="(target) => emit('quick', target)"
                />
            </template>

            <template v-if="props.tabs || active === 'assist'">
                <AssistPane
                    v-show="active === 'assist'"
                    :id="`${character.id}-pane-assist`"
                    :aria-labelledby="props.tabs ? `${character.id}-tab-assist` : undefined"
                    :aria-label="props.tabs ? undefined : '辅助'"
                    :tabbed="props.tabs"
                    :assists="character.assists"
                    :editable="editable"
                    :quick="quick"
                    @edit-row="(index, patch) => emit('edit-assist', index, patch)"
                    @add-row="(kind) => emit('add-assist', kind)"
                    @remove-row="(index) => emit('remove-assist', index)"
                    @quick="(target) => emit('quick', target)"
                />
            </template>

            <template v-if="props.tabs || active === 'training'">
                <TrainingPane
                    v-show="active === 'training'"
                    :id="`${character.id}-pane-training`"
                    :aria-labelledby="props.tabs ? `${character.id}-tab-training` : undefined"
                    :aria-label="props.tabs ? undefined : '修炼'"
                    :tabbed="props.tabs"
                    :groups="character.trainings"
                    :editable="editable"
                    :quick="quick"
                    @edit-level="(name, level) => emit('edit-training', name, level)"
                    @quick="(target) => emit('quick', target)"
                />
            </template>

            <template v-if="props.tabs">
                <GearPane
                    v-show="active === 'gear'"
                    :id="`${character.id}-pane-gear`"
                    :aria-labelledby="`${character.id}-tab-gear`"
                    :gear="character.gear"
                    :meta="character.gearMeta"
                    :quick="quick"
                    @open-tip="showTip"
                    @close-tip="closeAll"
                    @quick="(target) => emit('quick', target)"
                />

                <PetPane
                    v-show="active === 'pets'"
                    :id="`${character.id}-pane-pets`"
                    :aria-labelledby="`${character.id}-tab-pets`"
                    :pets="character.pets"
                    :quick="quick"
                    @open="openDetail"
                />
            </template>
        </div>

        <GearTip :anchor="tipAnchor" :detail="tip" :slot-name="tipSlot" />
    </PaperCard>
</template>

<style scoped src="./character-card.css"></style>
