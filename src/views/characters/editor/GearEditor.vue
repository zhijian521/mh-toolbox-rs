<script setup lang="ts">
import { computed, ref } from 'vue';
import CostSwitch from '../../../components/CostSwitch.vue';
import PressButton from '../../../components/PressButton.vue';
import PressTile from '../../../components/PressTile.vue';
import SegmentedPills from '../../../components/SegmentedPills.vue';
import IconTile from '../IconTile.vue';
import EditorRail from './EditorRail.vue';
import type { RailItem } from './rail';
import {
    GEAR_SLOT_ICON,
    type GearDetail,
    type GearSlot,
    type GearSlotName,
    type GearTone,
} from '../character';
import { gearSlotIcon } from '../../../services/game-icons';

/**
 * 装备：**左栏常驻十二个部位，右侧只编选中的那一件**（2026-11-05 改，方案 E2）。
 *
 * 旧版是十二行折叠：一行一件，点箭头展开这一件的六段详情。
 * 换掉它的理由只有一个，但很硬——**换一件要看的东西会重新排一次版**。
 * 折叠列表里，展开第二件时第一件收起，下面所有内容整体上移几百像素，
 * 视线得重新找「类型在哪一行」；录入十二件就是重找十二次。
 *
 * 现在左栏十二行是**固定的**（高度不变、顺序不变），右侧只换内容。
 * 顺带解决了三件事：
 *   · 一行一个「已填/没穿」的点，加上顶端「9 / 12」，空着哪几件一眼数得出；
 *   · 每行一枚 22 的小白盘（与卡上同一枚的缩小版），部位不必读字就认得出；
 *   · 顶部把「部位 + 装备名」提成标题行——卡上显示的就是装备名，它该是主字段。
 *
 * 左栏 `sticky`：右侧六段比左栏高，滚到底部时「我在改哪个部位」仍然看得见。
 */
const gear = defineModel<GearSlot[]>({ required: true });

/** 当前编辑的部位。默认落在**第一个填了的**部位上——打开就看见内容，而不是空表。 */
const selected = ref<string>(
    gear.value.find((slot) => filled(slot))?.slot ?? gear.value[0]?.slot ?? '',
);

const active = computed(() => gear.value.find((slot) => slot.slot === selected.value) ?? null);
const detail = computed<GearDetail | undefined>(() => active.value?.detail);

/**
 * 「这件填了没有」——**不看 `detail` 在不在**，看它有没有内容。
 *
 * 选中部位时会先建一个空壳（见 `select`），于是「点过一圈」会留下十二个空壳：
 * 壳在，但一个字都没填。若按「壳存在」判断，右上角会显示 12 / 12、十二个点全实心，
 * 而卡上一件都不会显示——同一个数据两种说法。
 */
function filled(slot: GearSlot): boolean {
    const d = slot.detail;
    if (!d) return false;
    return Boolean(
        slot.caption?.trim() ||
        d.name?.trim() ||
        d.kind?.trim() ||
        d.stats.length ||
        d.cond?.length ||
        d.lines?.length ||
        d.flavor?.trim() ||
        d.foot?.trim(),
    );
}

const filledCount = computed(() => gear.value.filter((slot) => filled(slot)).length);

/**
 * 换部位。离开之前把上一件的**空壳**删掉（`normalizeCharacter` 保存时本来也会丢，
 * 但编辑期间它会让点与计数失灵）。空壳的判据与 `filled` 同一条：
 * 有一个字就不算空壳，正在填的那件不会被误删。
 */
function select(slot: GearSlot) {
    if (selected.value === slot.slot) return;
    const previous = gear.value.find((row) => row.slot === selected.value);
    if (previous?.detail && !filled(previous)) delete previous.detail;
    selected.value = slot.slot;
    ensureDetail(slot);
}

/** 左栏抛上来的是 `key`（部位名），这里翻回那一行。找不到就什么都不做——
 *  十二行与 `GEAR_SLOTS` 同源，理论上不会缺，但静默比崩掉好。 */
function selectByKey(key: string) {
    const slot = gear.value.find((row) => row.slot === key);
    if (slot) select(slot);
}

/* 壳是临时的：`name` 预填装备名（卡上那个简称），这样「全名」不必再敲一遍；
 * 没有就留空。`stats` 建空数组（下面要 `v-for`），`cond` / `lines` 保持缺席——
 * 一件装备可能没有状态也没有套装，先建两个空数组等于给每件都塞两个空键。 */
function ensureDetail(slot: GearSlot): GearDetail {
    slot.detail ??= {
        name: slot.caption ?? '',
        kind: '',
        stats: [],
    };
    return slot.detail;
}

// 初始选中那件也要有壳，否则右侧的类型、属性没有地方可绑。
if (active.value) ensureDetail(active.value);

/* 装备条件在游戏里是一串独立的小签（等级 130 · 女 · 五行 木），
 * 输入时用逗号连着写最省事，于是读回来要按**中英文两种逗号**切——
 * 中文输入法下敲出来的几乎总是「，」。 */
function setRequires(target: GearDetail, event: Event) {
    const raw = (event.target as HTMLInputElement).value;
    const parts = raw
        .split(/[,，]/)
        .map((part) => part.trim())
        .filter(Boolean);
    target.requires = parts.length ? parts : undefined;
}

/* 图标按**部位**取（表见 `character.ts` 的 `GEAR_SLOT_ICON`），与卡上同一枚。
 * 图库是品类样图，玩家那件装备多半不在里面，所以不按装备名查。 */
function slotIcon(slot: GearSlotName): string | undefined {
    const file = GEAR_SLOT_ICON[slot];
    return file ? gearSlotIcon(file) : undefined;
}

/* 没图的部位（武器、玉魄）画一枚**淡墨首字**，与卡上同构：装备名首字，
 * 没名就用部位首字。左栏这么小，认的是「这格有没有东西」，不是认字。 */
function slotInitial(slot: GearSlot): string {
    const name = slot.caption?.trim();
    return (name ? name[0] : slot.slot[0]) ?? '';
}

/**
 * 左栏的行数据。`EditorRail` 只管画，这里负责把「十二个部位 + 填没填」翻译过去。
 *
 * 两处细节都在这一层解决，控件那边不认部位这回事：
 *   · 有图的部位给 `icon`，没图的给 `mark` 且 `tile: true`（换成压印块上的首字）；
 *   · `label` 是给读屏的整句话——只念「武器」，听不出这一行是干什么的。
 */
const railItems = computed<RailItem[]>(() =>
    gear.value.map((slot) => {
        const icon = slotIcon(slot.slot);
        return {
            key: slot.slot,
            name: slot.slot,
            label: `编辑${slot.slot}的装备`,
            filled: filled(slot),
            icon,
            mark: icon ? undefined : slotInitial(slot),
            tile: !icon,
        };
    }),
);

const TONE_OPTIONS: { value: GearTone; label: string }[] = [
    { value: 'seal', label: '朱' },
    { value: 'ochre', label: '赭' },
    { value: 'moss', label: '苔' },
];

/** 与属性那边同一条：开关给不了 `undefined`，而契约里「没有这个键」与 `false` 不同。 */
function setGain(stat: { gain?: boolean }, value: boolean) {
    stat.gain = value || undefined;
}

/* 「状态」与「特殊」两段在契约里是可选的（一件装备可能没有套装效果），
 * 加第一条时才建数组——先建空数组再判空，等于给每件装备都塞两个空键。 */
function addCond(target: GearDetail) {
    target.cond ??= [];
    target.cond.push({ label: '', value: '' });
}

function addLine(target: GearDetail) {
    target.lines ??= [];
    target.lines.push({ label: '', value: '', tone: 'seal' });
}
</script>

<template>
    <div class="gear-editor">
        <!-- 十二个部位**常驻**左栏。它是这张表单的目录：从上到下就是游戏面板的顺序，
             高度不变，所以「我在改哪一件」由位置回答，不用读标题。
             行高 30：十二行要挤进一屏（召唤兽那边只有五六行，给到 38）。 -->
        <EditorRail
            label="装备"
            :count="filledCount"
            :suffix="` / ${gear.length}`"
            :items="railItems"
            :selected="selected"
            :row-height="30"
            @pick="selectByKey"
        />

        <div v-if="active" class="pane-detail">
            <!-- 标题行：部位 + 装备名。卡上显示的就是这个简称，所以它是主字段；
                 全名、类型、条件退到下面一行——主次分开，不必在六个框里找「哪个是名字」。 -->
            <div class="det-top">
                <IconTile
                    v-if="slotIcon(active.slot)"
                    class="det-pic"
                    :src="slotIcon(active.slot)"
                />
                <PressTile v-else class="det-pic" still aria-hidden="true">
                    <span class="det-ini">{{ slotInitial(active) }}</span>
                </PressTile>
                <div class="det-head">
                    <div class="det-title">
                        <b>{{ active.slot }}</b>
                        <span>装备名 · 填了就会显示在卡上</span>
                    </div>
                    <input
                        v-model="active.caption"
                        class="field det-name"
                        :aria-label="`${active.slot} 的装备名`"
                        placeholder="装备名（留空 = 这个部位没穿）"
                    />
                </div>
            </div>

            <template v-if="detail">
                <div class="erow">
                    <span class="field-label">全名</span>
                    <input v-model="detail.name" class="field grow" aria-label="装备全名" />
                    <span class="field-label">类型</span>
                    <input
                        v-model="detail.kind"
                        class="field grow"
                        aria-label="装备类型"
                        placeholder="头盔 / 灵饰 · 戒指"
                    />
                </div>

                <div class="erow">
                    <span class="field-label">条件</span>
                    <input
                        class="field grow"
                        aria-label="装备条件，逗号分隔"
                        placeholder="等级 130，女，五行 木"
                        :value="(detail.requires ?? []).join('，')"
                        @change="setRequires(detail, $event)"
                    />
                </div>

                <!-- ---------- 白字与绿字 ----------
                     表头是这一版加的：原来四列全靠 placeholder 说明，
                     填上值之后就没人知道第三格是「精炼上限」、开关是「白/绿」。 -->
                <div class="sec-head">
                    <span class="section-mark"></span>属性
                    <span class="meta">绿字＝打造或镶嵌附加</span>
                </div>
                <div class="thead" aria-hidden="true">
                    <span class="stat-label">属性名</span>
                    <span class="stat-value">数值</span>
                    <span class="stat-extra">精炼</span>
                    <span class="stat-switch">白 · 绿</span>
                </div>
                <div v-for="(stat, si) in detail.stats" :key="si" class="erow">
                    <input
                        v-model="stat.label"
                        class="field stat-label"
                        aria-label="属性名"
                        placeholder="防御"
                    />
                    <input
                        v-model="stat.value"
                        class="field stat-value"
                        aria-label="属性值"
                        placeholder="+45"
                    />
                    <input
                        v-model="stat.extra"
                        class="field stat-extra"
                        aria-label="精炼上限"
                        placeholder="[+16]"
                    />
                    <CostSwitch
                        :model-value="stat.gain === true"
                        off-label="白字"
                        on-label="绿字"
                        @update:model-value="setGain(stat, $event)"
                    />
                    <PressButton
                        icon="trash"
                        label="删掉这条属性"
                        @click="detail.stats.splice(si, 1)"
                    />
                </div>
                <div class="sub-foot">
                    <PressButton
                        icon="add"
                        text="加一条"
                        label="加一条属性"
                        @click="detail.stats.push({ label: '', value: '' })"
                    />
                </div>

                <!-- ---------- 耐久 / 锻炼 / 宝石 ---------- -->
                <div class="sec-head">
                    <span class="section-mark"></span>状态
                    <span class="meta">耐久、锻炼 / 精炼 / 灵尘等级、镶嵌</span>
                </div>
                <div v-for="(item, ci) in detail.cond" :key="ci" class="erow">
                    <input
                        v-model="item.label"
                        class="field cond-label"
                        aria-label="状态名"
                        placeholder="耐久度"
                    />
                    <input
                        v-model="item.value"
                        class="field grow"
                        aria-label="状态值"
                        placeholder="941"
                    />
                    <PressButton
                        icon="trash"
                        label="删掉这一条状态"
                        @click="detail.cond!.splice(ci, 1)"
                    />
                </div>
                <div class="sub-foot">
                    <PressButton
                        icon="add"
                        text="加一条"
                        label="加一条状态"
                        @click="addCond(detail)"
                    />
                </div>

                <!-- ---------- 特技 / 特效 / 套装 ---------- -->
                <div class="sec-head">
                    <span class="section-mark"></span>特殊
                    <span class="meta">朱＝特技，赭＝套装，苔＝打造附加</span>
                </div>
                <div v-for="(line, li) in detail.lines" :key="li" class="erow">
                    <input
                        v-model="line.label"
                        class="field line-label"
                        aria-label="特殊行名"
                        placeholder="特技"
                    />
                    <input
                        v-model="line.value"
                        class="field grow"
                        aria-label="特殊内容"
                        placeholder="起死回生"
                    />
                    <SegmentedPills
                        :model-value="line.tone ?? 'seal'"
                        :options="TONE_OPTIONS"
                        radius="sm"
                        label="行色"
                        @update:model-value="line.tone = $event"
                    />
                    <PressButton
                        icon="trash"
                        label="删掉这一条"
                        @click="detail.lines!.splice(li, 1)"
                    />
                </div>
                <div class="sub-foot">
                    <PressButton
                        icon="add"
                        text="加一条"
                        label="加一条特殊效果"
                        @click="addLine(detail)"
                    />
                </div>

                <!-- ---------- 风味文本与制造者 ---------- -->
                <textarea
                    v-model="detail.flavor"
                    class="field area"
                    rows="2"
                    aria-label="风味描述"
                    placeholder="风味描述（可留空）"
                />
                <input
                    v-model="detail.foot"
                    class="field foot-field"
                    aria-label="制造者"
                    placeholder="制造者：……（可留空）"
                />
            </template>
        </div>
    </div>
</template>

<style scoped>
/* 左右两栏：左栏 152 是量出来的——最长的部位名「玉魄 · 阴」在 12px 下 56 宽，
 * 加一枚 22 的盘、8 的间距、右侧的点与两边留白，正好在这个数上收口。
 * 再窄，「玉魄 · 阴」就要换行；再宽，右侧四列属性行会被挤到放不下精炼上限。
 * 左栏本体在 `EditorRail.vue`（与召唤兽共用一套），这里只放两栏的栅格。 */
.gear-editor {
    display: grid;
    grid-template-columns: 152px minmax(0, 1fr);
    gap: 14px;
    align-items: start;
}

/* 右侧：一条竖线与左栏分开。用 `--rule`（比 `rule-2` 深一档）——这是版面分区，
 * 不是表格线，太淡会看成左栏的右边框。 */
.pane-detail {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
    padding-left: 14px;
    border-left: var(--w-hair) solid var(--rule);
}
.det-top {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 8px;
    border-bottom: var(--w-hair) solid var(--rule-2);
}
/* 右侧那枚 38 的盘。选择器写成 `.det-top .det-pic` 而不是单个 `.det-pic`：
 * `IconTile` 内部 `.icon-tile` 也声明了这几个变量，两边同特异性时谁赢取决于
 * 样式注入顺序——多带一层父选择器才稳（左栏那枚 22 的盘同一条，写在
 * `EditorRail.vue` 的 `.rail-item .rail-pic` 里）。 */
.det-top .det-pic {
    --tile-w: 38px;
    --tile-h: 38px;
    --tile-r: var(--r-2);
    --shot: 30px;
    --tile-drop: 0.55;
    --tile-face: light-dark(var(--paper), color-mix(in srgb, var(--paper-2) 84%, var(--ink)));
}
.det-ini {
    color: color-mix(in srgb, var(--ink-2) 78%, transparent);
    font-size: calc(18px * var(--fs-scale));
    line-height: 1;
}
.det-head {
    flex: 1;
    min-width: 0;
}
.det-title {
    display: flex;
    align-items: baseline;
    gap: 7px;
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.14em;
}
.det-title b {
    color: var(--ink);
    font-size: var(--fs-md);
    font-weight: 400;
    letter-spacing: 0.06em;
}
/* 装备名是主字段：比常规输入格高一档（30 对 26），字大一档。
 * 选择器同样多带一层 `.det-head`：`.field` 也声明 height / line-height，
 * 单类压不过「谁后注入」（`.field` 在 base.css，通常在前，但这条不该靠顺序）。 */
.det-head .det-name {
    width: 100%;
    height: calc(30px * var(--fs-scale));
    margin-top: 4px;
    font-size: var(--fs-base);
    line-height: calc(28px * var(--fs-scale));
}

.grow {
    flex: 1;
    min-width: 0;
}
/* 三组小标题：与卡内 `.group-head` 同一个说法（短竖条 + 标题），
 * 后面跟一句 `.meta` 说清这一组都填什么。 */
.sec-head {
    display: flex;
    align-items: baseline;
    gap: 7px;
    margin-top: 4px;
}
.sec-head .section-mark {
    align-self: center;
}
.sub-foot {
    padding-left: 2px;
}

/* 属性段的冷表头：与下面四列**同一套宽度类**，只在字距与颜色上退一档。
 * 左内距 8px 是为了对上 `.field` 里文字的位置——输入格有 7px 内距 + 1px 边框，
 * 表头贴着 0 起会看上去整体左移了半个字。 */
.thead {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 0 1px 8px;
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.1em;
    line-height: 1;
}
.thead span {
    flex: none;
}
.stat-label {
    width: 118px;
}
.stat-value {
    width: 82px;
}
.stat-extra {
    width: 66px;
}
/* 表头的「白 · 绿」要压住开关那两格的总宽（`.cost-opt` 每格 12px 内距 + 两个字的
 * `--fs-sm`，外框再 2px）——这一列对不齐最容易被看出来。字号档会改变两格的宽度，
 * 所以跟着 `--fs-scale` 走。 */
.stat-switch {
    width: calc(52px + 48px * var(--fs-scale));
}
.cond-label {
    width: 96px;
}
.line-label {
    width: 78px;
}
.foot-field {
    width: 100%;
}
.erow :deep(.cost-opt) {
    padding: 3px 6px;
}
</style>
