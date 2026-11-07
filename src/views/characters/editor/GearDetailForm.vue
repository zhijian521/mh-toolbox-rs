<script setup lang="ts">
import CostSwitch from '../../../components/CostSwitch.vue';
import PressButton from '../../../components/PressButton.vue';
import SegmentedPills from '../../../components/SegmentedPills.vue';
import type { GearDetail, GearTone } from '../character';

/**
 * 一件装备的**全部字段**：全名 / 类型 / 条件 / 属性 / 状态 / 特殊 / 风味 / 制造者。
 *
 * ---- 为什么单独成组件 ----
 * 这份表单原先长在 `GearEditor` 的右栏里，只有「编辑整张角色卡」那一条路用它。
 * 2026-11-07 用户要求快速修改也能改整件装备（「装备和宝宝比较复杂，直接展示某个装备
 * 和宝宝的所有内容进行修改」），于是同一份表单要在两个尺寸下出现：编辑器的右栏（窄、
 * 与左栏目录并排）和快速修改的弹窗（宽、独占一屏）。
 *
 * 复制一份是最省事的做法，也是最贵的：装备的字段不是固定的——上古玉魄的奇袭三项
 * 还在等 `GearDetail` 扩字段，扩的那天一定会有一个地方漏掉，而那种漏不报错，只是
 * 「在编辑器里填了、在快捷窗里看不见」。所以两处共用这一个组件，宽度由外层给。
 *
 * ---- 它不管的那些 ----
 * ① **卡上那个短名**（`GearSlot.caption`）：它是「格子里显示什么」，不是装备本身
 *    的字段，两处的外壳各自画（编辑器在带图标的标题行里，快速修改在第一行）。
 * ② **部位**：它回答的是「这是哪一格」，属于外壳。
 * ③ 这里改的是**传进来的那一份对象**（`v-model`），不做拷贝——拷贝与保存的时机由
 *    外壳决定：编辑器边改边写进草稿，快速修改在点「保存」时才落到角色上。
 */
const detail = defineModel<GearDetail>({ required: true });

/* 装备条件在游戏里是一串独立的小签（等级 130 · 女 · 五行 木），
 * 输入时用逗号连着写最省事，于是读回来要按**中英文两种逗号**切——
 * 中文输入法下敲出来的几乎总是「，」。
 *
 * 用 `@change`（失焦才解析）而不是 `v-model`：边敲边 split 再 join，会把用户正在
 * 输入的那一格重排，光标跳到行首。 */
function setRequires(target: GearDetail, event: Event) {
    const raw = (event.target as HTMLInputElement).value;
    const parts = raw
        .split(/[,，]/)
        .map((part) => part.trim())
        .filter(Boolean);
    target.requires = parts.length ? parts : undefined;
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
    <div class="gear-form">
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
            <PressButton icon="trash" label="删掉这条属性" @click="detail.stats.splice(si, 1)" />
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
            <input v-model="item.value" class="field grow" aria-label="状态值" placeholder="941" />
            <PressButton icon="trash" label="删掉这一条状态" @click="detail.cond!.splice(ci, 1)" />
        </div>
        <div class="sub-foot">
            <PressButton icon="add" text="加一条" label="加一条状态" @click="addCond(detail)" />
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
            <PressButton icon="trash" label="删掉这一条" @click="detail.lines!.splice(li, 1)" />
        </div>
        <div class="sub-foot">
            <PressButton icon="add" text="加一条" label="加一条特殊效果" @click="addLine(detail)" />
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
    </div>
</template>

<style scoped>
/* 一列字段，段距 7：这是编辑器右栏一直用的那个数（原来写在 `.pane-detail` 上）。
 * 表单本身不设宽度与内衬——那是外壳的事（编辑器是那道竖槽，快速修改是弹窗正文）。 */
.gear-form {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
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
