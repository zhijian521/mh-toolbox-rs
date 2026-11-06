<script setup lang="ts">
import PaperCard from '../../components/PaperCard.vue';
import { ref } from 'vue';
import PressButton from '../../components/PressButton.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import GearTip from './GearTip.vue';
import PetDetail from './PetDetail.vue';
import AssistPane from './panes/AssistPane.vue';
import AttrPane from './panes/AttrPane.vue';
import GearPane from './panes/GearPane.vue';
import PetPane from './panes/PetPane.vue';
import SkillPane from './panes/SkillPane.vue';
import TrainingPane from './panes/TrainingPane.vue';
import { PANES, type CharacterData, type GearDetail, type PaneKey, type Pet } from './character';

/**
 * 一张角色卡：**一张纸上的六个分区**，用卡内页签切换。
 *
 * 为什么不是「侧边竖排按钮 + 一张长卡」：卡宽只有 450，侧栏一挤就变成第三列；
 * 而且名册一行要放两张，切换控件只能收进卡内。
 *
 * 为什么卡高写死 620（`--char-h`）：同一行的卡必须**齐头齐脚**，否则第二行会被最高那张顶歪。
 * 代价是内容少的分区（召唤兽）底下会空一块——那里就只是留白，不再压一句页脚说明
 * （2026-11-03 用户要求删掉卡片上所有手抄的注脚）。
 *
 * 六个页签均分卡宽：`(450 − 40 − 4) / 6 ≈ 67.3` 一格，扣掉格内两侧 8 的留白得
 * 59.3；最长的「召唤兽」三个字在 1.1 字号档约 46（`--fs-base` 13.5 × 1.1 × 3 +
 * 字距），余 13。卡宽一改就要重算这个数，**仍是六格封顶**——再加第七个得改文案
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
 * 留在本文件里的只有**卡的壳**：卡头、页签条、滚动容器，以及两层浮层
 * （装备浮片 `GearTip` 与兽的详情档案 `PetDetail`）。浮层留在这里不是偷懒：
 * 它们必须挂在滚动容器**之外**，而「滚动就收浮片」这个监听也是这一层的。
 * 每一页只把「要看哪一件 / 哪一只」抛上来，自己不画浮层。
 */
defineProps<{ character: CharacterData }>();
const emit = defineEmits<{ edit: []; remove: [] }>();

const active = ref<PaneKey>('attrs');

/* 页签的值与文案一次算好：滑块要的是 `{ value, label }[]`，而 `PANES` 是只读元组，
 * 直接在模板里 `map` 会每次渲染新建一个数组，`useRovingFocus` 的 `values()` 也随之变。 */
const PANE_OPTIONS = PANES.map((pane) => ({ value: pane.key, label: pane.label }));

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

/* 装备页抛上来的是**量好的 rect**，不是事件：`getBoundingClientRect()` 得在事件
 * 当时同一帧取，隔着一次 emit 再去读 `event.currentTarget` 可能已经是空的。 */
function showTip(payload: { anchor: DOMRect; detail: GearDetail }) {
    tipAnchor.value = payload.anchor;
    tip.value = payload.detail;
}

function closeAll() {
    tip.value = null;
    tipAnchor.value = null;
}

/* 兽的详情档案：与装备浮片同一层的浮层，所以状态也留在这里。 */
const detailPet = ref<Pet | null>(null);

function openDetail(pet: Pet) {
    closeAll();
    detailPet.value = pet;
}

/* 经验条的两个值、生活/剧情分组、十二格的坐标与图标、召唤兽牌的取数，
 * 都跟着各自的分区搬进了 `panes/`——那里才有用到它们的那份模板。 */
</script>

<template>
    <!-- `data-school` 给浅染用（`character-card.css` 里二十一条映射）。
         空门派时属性为空串，不匹配任何一条 → 卡底回落纸色。
         原先还挂着 `dual-rule`（离卡缘 3px 的一圈 1px 内衬线），2026-11-06
         用户要求「最外面的一圈细边框去掉」——卡边只剩纸自己的棱与落影。 -->
    <PaperCard as="article" class="char" :data-school="character.school || ''">
        <header class="char-head">
            <div class="who-block">
                <div class="who">
                    <h2>{{ character.name }}</h2>
                    <span class="lv num">{{ character.level }} 级</span>
                    <!-- 门派空着就不挂签：一个新角色还没填门派，画一个空胶囊
                         比不画更像「这里坏了」。 -->
                    <span v-if="character.school" class="chip school">{{ character.school }}</span>
                </div>
                <!-- 名字下面那行小字：区服 · 帮派。两项各自 `v-if`，
                     只填了一项时不是「A · 」，也不会留下一个空的点。 -->
                <p v-if="character.server || character.guild" class="meta char-sub">
                    <span v-if="character.server">{{ character.server }}</span>
                    <span v-if="character.server && character.guild" class="dot">·</span>
                    <span v-if="character.guild">{{ character.guild }}</span>
                </p>
            </div>
            <!-- 卡头右侧：改与删。两枚都是纯图标 26px，与左栏、工具页同一种压印块。
                 删除只把事件抛出去，确认窗由名册页开——卡上不出现第二种「确认」的问法。 -->
            <div class="head-actions">
                <PressButton icon="edit" label="编辑这个角色" @click="emit('edit')" />
                <PressButton icon="trash" label="删除这个角色" @click="emit('remove')" />
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
            <!-- 六个分区各是一个组件，`id` 与 `aria-labelledby` 由这里给：
                 它们要与页签条那枚按钮的 `-tab-xxx` 同名，而页签是这一层画的
                 （`SteppedSlider` 的 `prefix`）。`v-show` 也挂在这一层——
                 六个分区要一直挂载着，切回来才不会丢掉滚动位置。
                 分区根元素是 `<section class="pane">`，它的 `role="tabpanel"`
                 由组件自己带。 -->
            <AttrPane
                v-show="active === 'attrs'"
                :id="`${character.id}-pane-attrs`"
                :aria-labelledby="`${character.id}-tab-attrs`"
                :groups="character.attrGroups"
                :experience="character.experience"
            />

            <SkillPane
                v-show="active === 'skills'"
                :id="`${character.id}-pane-skills`"
                :aria-labelledby="`${character.id}-tab-skills`"
                :rows="character.skills"
            />

            <AssistPane
                v-show="active === 'assist'"
                :id="`${character.id}-pane-assist`"
                :aria-labelledby="`${character.id}-tab-assist`"
                :assists="character.assists"
            />

            <TrainingPane
                v-show="active === 'training'"
                :id="`${character.id}-pane-training`"
                :aria-labelledby="`${character.id}-tab-training`"
                :groups="character.trainings"
            />

            <GearPane
                v-show="active === 'gear'"
                :id="`${character.id}-pane-gear`"
                :aria-labelledby="`${character.id}-tab-gear`"
                :gear="character.gear"
                :meta="character.gearMeta"
                @open-tip="showTip"
                @close-tip="closeAll"
            />

            <PetPane
                v-show="active === 'pets'"
                :id="`${character.id}-pane-pets`"
                :aria-labelledby="`${character.id}-tab-pets`"
                :pets="character.pets"
                :char-level="character.level"
                @open="openDetail"
            />
        </div>

        <GearTip :anchor="tipAnchor" :detail="tip" />

        <!-- 详情档案 `Teleport` 到 body，所以挂在这里只是逻辑位置。 -->
        <PetDetail
            v-if="detailPet"
            :pet="detailPet"
            :char-level="character.level"
            @close="detailPet = null"
        />
    </PaperCard>
</template>

<style scoped src="./character-card.css"></style>
