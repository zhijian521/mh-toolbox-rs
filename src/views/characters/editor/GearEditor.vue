<script setup lang="ts">
import { computed, ref } from 'vue';
import CostSwitch from '../../../components/CostSwitch.vue';
import PressButton from '../../../components/PressButton.vue';
import SegmentedPills from '../../../components/SegmentedPills.vue';
import type { GearDetail, GearSlot, GearTone } from '../character';

/**
 * 装备：十二个部位固定成十二行，**点开哪一行才铺开哪一件的详情**。
 *
 * 为什么不是「左边列表右边表单」：卡内那格只有 112px 见方，能写下的只有装备名，
 * 而详情有六段（类型、条件、白字、状态、特殊、制造者）。一屏十二件全展开是
 * 十二张六段表，滚动条会拉到看不见顶；折叠成「一行一件」之后，先扫一遍
 * 「哪些部位空着」，再逐个展开——这才是录入时的真实顺序。
 *
 * 空位（`caption` 与 `detail` 都没有）在这里不是「删掉这一行」，而是**留空**：
 * 十二个部位是游戏里固定的十二格，少一格就读成「这个号只有十一件」。
 */
const gear = defineModel<GearSlot[]>({ required: true });

/** 当前展开的部位名。一次只开一件：两件并排展开时，视线要来回跳两屏。 */
const openSlot = ref<string | null>(null);

const openDetail = computed<GearDetail | undefined>(
    () => gear.value.find((slot) => slot.slot === openSlot.value)?.detail,
);

function toggle(slot: GearSlot) {
    if (openSlot.value === slot.slot) {
        openSlot.value = null;
        return;
    }
    openSlot.value = slot.slot;
    /* 展开即建壳。**壳是临时的**：`normalizeCharacter` 在保存时会把
     * 「名称与类型都空」的详情整段丢掉（见 `roster.ts`），所以点开又收起
     * 不会在数据里留下一个空对象——浮片不会浮出一张白纸。 */
    slot.detail ??= {
        name: slot.caption ?? '',
        kind: '',
        stats: [],
        cond: [],
    };
}

/* 装备条件在游戏里是一串独立的小签（等级 130 · 女 · 五行 木），
 * 输入时用逗号连着写最省事，于是读回来要按**中英文两种逗号**切——
 * 中文输入法下敲出来的几乎总是「，」。 */
function setRequires(detail: GearDetail, event: Event) {
    const raw = (event.target as HTMLInputElement).value;
    const parts = raw
        .split(/[,，]/)
        .map((part) => part.trim())
        .filter(Boolean);
    detail.requires = parts.length ? parts : undefined;
}

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
function addCond(detail: GearDetail) {
    detail.cond ??= [];
    detail.cond.push({ label: '', value: '' });
}

function addLine(detail: GearDetail) {
    detail.lines ??= [];
    detail.lines.push({ label: '', value: '', tone: 'seal' });
}
</script>

<template>
    <div class="gear-editor">
        <!-- 一句话交代两件事：留空是什么意思、箭头点开是什么。十二行都写进 placeholder
             会把「装备名（留空 = 这个部位没穿）」重复十二遍，读起来像十二条规定。 -->
        <p class="hint gear-hint">留空的部位就是没穿；点右侧箭头展开这一件的详情。</p>

        <div v-for="slot in gear" :key="slot.slot" class="slot-block">
            <div class="erow slot-head">
                <span class="chip slot-tag">{{ slot.slot }}</span>
                <input
                    v-model="slot.caption"
                    class="field caption-field"
                    :aria-label="`${slot.slot} 的装备名`"
                    placeholder="装备名"
                />
                <PressButton
                    :icon="openSlot === slot.slot ? 'chevron-down' : 'chevron-right'"
                    :label="`${openSlot === slot.slot ? '收起' : '展开'} ${slot.slot} 的详情`"
                    @click="toggle(slot)"
                />
            </div>

            <div v-if="openSlot === slot.slot && openDetail" class="detail">
                <div class="erow">
                    <span class="field-label">名称</span>
                    <input v-model="openDetail.name" class="field grow" aria-label="装备全名" />
                    <span class="field-label">类型</span>
                    <input
                        v-model="openDetail.kind"
                        class="field grow"
                        aria-label="装备类型"
                        placeholder="帽子 / 灵饰 · 戒指"
                    />
                </div>

                <div class="erow">
                    <span class="field-label">条件</span>
                    <input
                        class="field grow"
                        aria-label="装备条件，逗号分隔"
                        placeholder="等级 130，女，五行 木"
                        :value="(openDetail.requires ?? []).join('，')"
                        @change="setRequires(openDetail, $event)"
                    />
                </div>

                <!-- ---------- 白字与绿字 ---------- -->
                <div class="sub-head">
                    <span class="section-mark"></span>属性
                    <span class="meta">绿字＝打造或镶嵌附加</span>
                </div>
                <div v-for="(stat, si) in openDetail.stats" :key="si" class="erow">
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
                        @click="openDetail.stats.splice(si, 1)"
                    />
                </div>
                <div class="sub-foot">
                    <PressButton
                        icon="add"
                        text="加一条"
                        label="加一条属性"
                        @click="openDetail.stats.push({ label: '', value: '' })"
                    />
                </div>

                <!-- ---------- 耐久 / 锻炼 / 宝石 ---------- -->
                <div class="sub-head">
                    <span class="section-mark"></span>状态
                    <span class="meta">耐久、锻炼 / 精炼 / 灵尘等级、镶嵌</span>
                </div>
                <div v-for="(item, ci) in openDetail.cond" :key="ci" class="erow">
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
                        @click="openDetail.cond!.splice(ci, 1)"
                    />
                </div>
                <div class="sub-foot">
                    <PressButton
                        icon="add"
                        text="加一条"
                        label="加一条状态"
                        @click="addCond(openDetail)"
                    />
                </div>

                <!-- ---------- 特技 / 特效 / 套装 ---------- -->
                <div class="sub-head">
                    <span class="section-mark"></span>特殊
                    <span class="meta">朱＝特技，赭＝套装，苔＝打造附加</span>
                </div>
                <div v-for="(line, li) in openDetail.lines" :key="li" class="erow">
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
                        @click="openDetail.lines!.splice(li, 1)"
                    />
                </div>
                <div class="sub-foot">
                    <PressButton
                        icon="add"
                        text="加一条"
                        label="加一条特殊效果"
                        @click="addLine(openDetail)"
                    />
                </div>

                <!-- ---------- 风味文本与制造者 ---------- -->
                <textarea
                    v-model="openDetail.flavor"
                    class="field area"
                    rows="2"
                    aria-label="风味描述"
                    placeholder="风味描述（可留空）"
                />
                <input
                    v-model="openDetail.foot"
                    class="field foot-field"
                    aria-label="制造者"
                    placeholder="制造者：……（可留空）"
                />
            </div>
        </div>
    </div>
</template>

<style scoped>
.gear-editor {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.gear-hint {
    margin-bottom: 2px;
}
/* 一件 = 一行头 +（展开时）一张详情纸。详情纸用比卡底再淡一档的纸色包起来，
 * 否则十二行展开之后分不清哪几段属于哪一件。 */
.slot-block {
    border: var(--w-hair) solid transparent;
}
.slot-block:has(.detail) {
    padding-bottom: 10px;
    border-color: var(--rule);
    background: var(--bg);
}
.slot-head {
    padding: 0;
}
/* 部位的签固定 48px：十二个部位名字数不同（头 / 项链 / 玉魄·阴），
 * 给固定宽之后每行的输入框从同一条竖线起。 */
.slot-tag {
    flex: none;
    justify-content: center;
    width: 48px;
}
.caption-field {
    flex: 1;
    min-width: 0;
}
.detail {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 10px 2px;
}
.grow {
    flex: 1;
    min-width: 0;
}
/* 三组小标题：与卡内 `.group-head` 同一个说法（短竖条 + 标题），
 * 后面跟一句 `.meta` 说清这一组都填什么。 */
.sub-head {
    display: flex;
    align-items: baseline;
    gap: 7px;
    margin-top: 4px;
}
.sub-head .section-mark {
    align-self: center;
}
.sub-foot {
    padding-left: 2px;
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
