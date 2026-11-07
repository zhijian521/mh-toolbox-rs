<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import NumberField from '../../components/NumberField.vue';
import PressButton from '../../components/PressButton.vue';
import { useRoster } from '../characters/roster';
import { metricValue, type Goal } from './goals';

/**
 * 批量更新养成：把各角色档案里的同一个项目一次改完。
 *
 * 填的是**角色当前的实际值**，不是增量——这一屏写的就是档案本身。留空表示「这个号还没录」，
 * 不会把档案清成 0（`off` 与 `0 级` 在游戏里是两件事）。
 *
 * 不落「变更历史」：新仓的角色档案没有成长流水（旧仓有 `growthHistory`，新仓没搬）。
 * 与其在这一个窗里再造一份只有目标看得见的半截历史，不如不做——要查谁什么时候练的，
 * 那是角色页的事。
 */
const props = defineProps<{ goal: Goal }>();
const emit = defineEmits<{ save: [values: { id: string; value: number }[]]; close: [] }>();

const { roster } = useRoster();

const tracking = computed(() => props.goal.tracking!);

/** 只列还在名册里的成员：删掉的人没有档案可写。 */
const rows = computed(() =>
    props.goal.members
        .map((member) => {
            const character = roster.value.find((one) => one.id === member.id);
            if (!character) return null;
            const value = metricValue(character, tracking.value);
            return {
                id: member.id,
                name: character.name || member.name || '未命名',
                value,
                done: value !== null && value >= props.goal.target,
            };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
);

const inputs = reactive<Record<string, number>>(
    Object.fromEntries(rows.value.map((row) => [row.id, row.value ?? 0])),
);

const changed = computed(() =>
    rows.value.filter((row) => {
        const next = inputs[row.id];
        /* 「原来没记录」与「记了一个 0」要分开判：前者填 0 也算一次修改。 */
        return row.value === null ? Number.isFinite(next) : next !== row.value;
    }),
);

const error = ref('');

function submit() {
    if (!changed.value.length) {
        error.value = '一个数都没改';
        return;
    }
    error.value = '';
    emit(
        'save',
        changed.value.map((row) => ({ id: row.id, value: inputs[row.id] })),
    );
}
</script>

<template>
    <ModalShell title="更新养成" :width="420" :scroll="false" @close="emit('close')">
        <p class="hint">「{{ tracking.key }}」当前值，保存后同步到角色档案。</p>
        <!-- 与记一笔同一个理由：`PressButton` 是 `type="button"`，回车没有隐式提交，
             这里显式接住。填一串数、按回车，是这张表最自然的用法。 -->
        <form class="growth" @submit.prevent="submit" @keydown.enter.prevent="submit">
            <label v-for="row in rows" :key="row.id" class="growth-row">
                <span class="who">
                    {{ row.name }}
                    <small v-if="row.done">已达标</small>
                    <small v-else-if="row.value === null" class="muted">待补录</small>
                    <small v-else>还差 {{ Math.max(0, goal.target - row.value) }}</small>
                </span>
                <NumberField
                    v-model="inputs[row.id]"
                    :label="row.name + ' 的当前值'"
                    zero-as-empty
                />
            </label>
            <p v-if="!rows.length" class="hint">这一批成员都已经不在名册里了。</p>
            <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        </form>
        <template #footer>
            <span class="footer-hint">
                {{ goal.target }}{{ goal.unit }} · {{ rows.length }} 个角色
            </span>
            <PressButton data-modal-cancel text="取消" label="不改了" @click="emit('close')" />
            <PressButton
                icon="check"
                text="保存"
                label="保存这些值"
                :disabled="!changed.length"
                seal
                @click="submit"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
.growth {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
}
.growth-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 108px;
    align-items: center;
    gap: 10px;
}
.who {
    display: flex;
    align-items: baseline;
    gap: 6px;
    overflow: hidden;
    color: var(--ink-2);
    font-size: var(--fs-sm);
    white-space: nowrap;
    text-overflow: ellipsis;
}
.who small {
    color: var(--moss);
    font-size: var(--fs-mini);
}
.who small.muted {
    color: var(--muted);
}
.footer-hint {
    margin-right: auto;
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.04em;
}
.form-error {
    margin: 0;
    color: var(--cinnabar);
    font-size: var(--fs-sm);
}
</style>
