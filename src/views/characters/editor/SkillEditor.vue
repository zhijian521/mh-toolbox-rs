<script setup lang="ts">
import CostSwitch from '../../../components/CostSwitch.vue';
import NumberField from '../../../components/NumberField.vue';
import PressButton from '../../../components/PressButton.vue';
import SegmentedPills from '../../../components/SegmentedPills.vue';
import type { AssistKind, AssistSkill, SkillRow } from '../character';

/**
 * 师门 / 辅助共用一张表：形状一样（名字 + 等级 + 上限），只差一列「未学」。
 *
 * 合成一个组件而不是两个，是因为**行本身是同一件东西**——两边都是游戏里一列技能，
 * 只是辅助那一页会显示「没学的也占一行」。分成两个组件，将来加一列（比如修炼进度）
 * 就要改两处，而这两处永远该一起变。
 *
 * `kind` 不叫 `variant`：它不改变这一行的长相，只决定**有没有额外那一列**。
 */
const props = withDefaults(defineProps<{ kind?: 'skill' | 'assist' }>(), {
    kind: 'skill',
});

/* 行数组走 `v-model`：增删要写回数组本身，只读 prop 过不了 `vue/no-mutating-props`。
 * 传进来的仍是草稿里那一个数组（同一个引用），没有第二份副本。 */
const rows = defineModel<SkillRow[]>({ required: true });

/* 师门技能上限 180（用户 2026-11-02 确认），新增时就带上——否则每加一项都要手填一次。
 * 辅助不预设：生活技能按等级段走、剧情技能 5 级，两类不同，先留空由用户填。 */
function addRow() {
    if (props.kind === 'assist') {
        rows.value.push({ name: '', level: 0, kind: 'life' } as AssistSkill);
    } else {
        rows.value.push({ name: '', level: 0, cap: 180 });
    }
}

/* 辅助技能要把「生活 / 剧情」带上：两类在同一张表里，没有这个字段就分不出
 * 「强身术 100」与「调息 5」是同一把尺子还是两把。 */
const TYPE_OPTIONS: { value: AssistKind; label: string }[] = [
    { value: 'life', label: '生活' },
    { value: 'story', label: '剧情' },
];

const kindOf = (row: SkillRow): AssistKind => (row as AssistSkill).kind ?? 'life';

function setKind(row: SkillRow, kind: AssistKind) {
    (row as AssistSkill).kind = kind;
}
</script>

<template>
    <div class="skill-editor">
        <div v-for="(row, i) in rows" :key="i" class="erow" :class="{ off: row.off }">
            <input
                v-model="row.name"
                class="field name-field"
                aria-label="技能名"
                placeholder="技能名"
            />
            <SegmentedPills
                v-if="props.kind === 'assist'"
                :model-value="kindOf(row)"
                :options="TYPE_OPTIONS"
                radius="sm"
                label="技能类别"
                @update:model-value="setKind(row, $event)"
            />
            <NumberField
                :model-value="row.level"
                label="等级"
                class="lv-field"
                @update:model-value="row.level = $event"
            />
            <!-- 上限留空 = 不知道。存 0 会把「不知道」变成「不可能是满级」，
                 所以这里写回的是 `undefined`（见 `character.ts` 的 `SkillRow.cap`）。 -->
            <NumberField
                :model-value="row.cap ?? 0"
                zero-as-empty
                label="上限"
                placeholder="上限"
                class="cap-field"
                @update:model-value="row.cap = $event || undefined"
            />
            <CostSwitch
                v-if="props.kind === 'assist'"
                :model-value="row.off === true"
                off-label="已学"
                on-label="未学"
                @update:model-value="row.off = $event || undefined"
            />
            <PressButton icon="trash" label="删掉这一项" @click="rows.splice(i, 1)" />
        </div>

        <div class="skill-foot">
            <PressButton icon="add" text="加一项" label="加一项技能" @click="addRow" />
            <span class="hint">名字留空的行保存时会被丢掉</span>
        </div>
    </div>
</template>

<style scoped>
/* 与修炼那一列同宽：两个页签的行如果宽度不同，来回切换时整列会左右跳。
 * 固定宽而不是 flex: 1——撑满会把等级推进行尾，中间空一片。 */
.name-field {
    width: 200px;
}
.lv-field {
    width: 66px;
}
.cap-field {
    width: 66px;
}
/* 未学那一行整行降一档：与卡内那张表同一个说法（`.skill-row.off`），
 * 编辑时也要一眼看出「这行是没学的」，否则录完回头核对得逐条读。 */
.off .name-field {
    color: var(--muted);
}
.skill-foot {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
}
.erow :deep(.cost-opt) {
    padding: 3px 6px;
}
</style>
