<script setup lang="ts">
import { computed, ref, watch, useId } from 'vue';
import DateField from '../../components/DateField.vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import FormActions from '../../components/FormActions.vue';
import TimeField from '../../components/TimeField.vue';
import TogglePills from '../../components/TogglePills.vue';
import { ALL_OPTIONS } from '../../components/select-options';
import { askConfirm } from '../../composables/use-confirm';
import { usePersistedSubmit } from '../../composables/use-persisted-submit';
import { notify } from '../../composables/use-notify';
import { dateText, todayText } from '../../services/format';
import { normalizeTime, timeText } from '../../services/clock';
import { useRoster } from '../characters/roster';
import { ownersOf, type ReadonlyOnlineSession } from './online';
import { useOnline } from './online-store';
import { characterOptions } from '../characters/character-options';
import { backfillDraft, backfillEndAt, onlineTimeAt as atOf } from './online-time';

const props = defineProps<{
    mode: 'start' | 'backfill' | 'edit';

    session?: ReadonlyOnlineSession;
    characterIds?: string[];
}>();

const emit = defineEmits<{ close: [] }>();

const { startOnline, backfillOnline, updateOnline, removeOnline, flush, retry, writeError } =
    useOnline();
const { roster } = useRoster();
const draft = usePersistedSubmit(flush, retry);
const { saving, action, locked } = draft;
const noteId = useId();
let successText = '';

function close() {
    if (!saving.value) emit('close');
}

const editing = computed(() => props.mode === 'edit');
const editableEnd = computed(
    () => editing.value && props.session !== undefined && props.session.endAt !== null,
);

const busyIds = computed(() => {
    const busy = new Set<string>();
    for (const one of useOnline().sessions.value) {
        if (one.endAt !== null) continue;
        for (const id of ownersOf(one)) busy.add(id);
    }
    return busy;
});

function baseIds(): string[] {
    const one = props.session;
    if (!one)
        return (props.characterIds ?? []).filter(
            (id) =>
                roster.value.some((character) => character.id === id) &&
                (props.mode !== 'start' || !busyIds.value.has(id)),
        );

    return ownersOf(one);
}

const ids = ref<string[]>(baseIds());

const initial =
    props.mode === 'backfill'
        ? backfillDraft()
        : {
              date: dateText(props.session?.startAt ?? Date.now()),
              startTime: timeText(props.session?.startAt ?? Date.now()),
              endTime: timeText(props.session?.endAt ?? Date.now()),
          };
const date = ref(initial.date);
const startTime = ref(initial.startTime);
const endTime = ref(initial.endTime);
const endDate = ref(dateText(props.session?.endAt ?? Date.now()));
const note = ref(props.session?.note ?? '');

const options = computed(() =>
    characterOptions(roster.value, baseIds()).map((one) => ({
        ...one,
        label: busyIds.value.has(one.value) ? `${one.label} · 在线中` : one.label,
        disabled: props.mode === 'start' && busyIds.value.has(one.value),
    })),
);

const availableIds = computed(() =>
    options.value.filter((one) => !one.disabled).map((one) => one.value),
);
const allSelected = computed(
    () => availableIds.value.length > 0 && availableIds.value.every((id) => ids.value.includes(id)),
);
const roleOptions = computed(() =>
    props.mode === 'start'
        ? [
              { value: ALL_OPTIONS, label: '全部', disabled: !availableIds.value.length },
              ...options.value,
          ]
        : options.value,
);
// 「全部」只控制勾选，提交时仍传真实角色 ID，不能把占位值写进上线记录。
const selectedIds = computed({
    get: () =>
        props.mode === 'start' && allSelected.value ? [ALL_OPTIONS, ...ids.value] : ids.value,
    set: (next: string[]) => {
        if (props.mode === 'start' && next.includes(ALL_OPTIONS) !== allSelected.value) {
            ids.value = next.includes(ALL_OPTIONS) ? [...availableIds.value] : [];
        } else {
            ids.value = next.filter((id) => id !== ALL_OPTIONS);
        }
    },
});

const error = ref('');

watch(
    [ids, date, startTime, endDate, endTime, note],
    () => {
        error.value = '';
    },
    { deep: true },
);

const canSave = computed(
    () =>
        !saving.value &&
        action.value !== 'delete' &&
        (action.value === 'save' || ids.value.length > 0),
);

function applySave(): boolean {
    error.value = '';
    if (!ids.value.length) {
        error.value = '先选一个号';
        return false;
    }
    if (props.mode === 'start') {
        const result = startOnline({ characterIds: ids.value, note: note.value });
        if (!result.ok) error.value = result.error;
        successText = '开始计时';
        return result.ok;
    }
    const start = normalizeTime(startTime.value);
    if (!start) {
        error.value = '开始时刻格式有误';
        return false;
    }
    const startAt = atOf(date.value, start, editing.value ? props.session?.startAt : undefined);
    if (props.mode === 'backfill') {
        const end = normalizeTime(endTime.value);
        if (!end) {
            error.value = '结束时刻格式有误';
            return false;
        }
        const result = backfillOnline({
            characterIds: ids.value,
            startAt,
            endAt: backfillEndAt(date.value, end, startAt),
            note: note.value,
        });
        if (!result.ok) error.value = result.error;
        successText = '已补记一段';
        return result.ok;
    }
    if (!props.session) return false;
    let endAt: number | undefined;
    if (editableEnd.value) {
        const end = normalizeTime(endTime.value);
        if (!end) {
            error.value = '结束时刻格式有误';
            return false;
        }
        endAt = atOf(endDate.value, end, props.session.endAt ?? undefined);
    }
    const result = updateOnline(props.session.id, {
        startAt,
        endAt,
        characterIds: ids.value,
        note: note.value,
    });
    if (!result.ok) error.value = result.error;
    successText = '已改好';
    return result.ok;
}

async function submit() {
    if (!(await draft.run('save', applySave))) return;
    notify.success(successText);
    emit('close');
}

async function remove() {
    const one = props.session;
    if (!one || saving.value || action.value === 'save') return;
    if (action.value !== 'delete') {
        const ok = await askConfirm({
            danger: true,
            title: '删除这一段上线记录？',
            note: '删除整段记录后，对应日期的点卡也会跟着减，不能撤回。',
            confirmText: '删除',
        });
        if (!ok) return;
    }
    const removed = await draft.run('delete', () => {
        if (!removeOnline(one.id)) {
            error.value = '这条记录未删除，请检查账本状态后重试';
            return false;
        }
        return true;
    });
    if (!removed) return;
    notify.success('已删除');
    emit('close');
}

const title = computed(() => {
    if (props.mode === 'start') return '开始计时';
    if (props.mode === 'backfill') return '补记一段';
    return '改这一段';
});

const submitText = computed(() => {
    if (action.value === 'save') return '重试保存';
    if (props.mode === 'edit') return '保存';
    return props.mode === 'start' ? '开始' : '补记';
});
</script>

<template>
    <ModalShell :title="title" :width="420" :scroll="false" @close="close">
        <form class="income-form modal-form" @submit.prevent="submit">
            <fieldset class="income-form" :disabled="locked" :inert="locked">
                <div class="form-field character-pick">
                    <span class="field-label">记给谁</span>
                    <TogglePills
                        v-model="selectedIds"
                        class="wrap"
                        :options="roleOptions"
                        label="选择在线的角色"
                        :disabled="locked"
                    />
                    <p v-if="!roster.length" class="note error" role="alert">
                        名册里还没有角色。先去角色页加一个，再回来记。
                    </p>
                </div>

                <template v-if="mode !== 'start'">
                    <div :class="editableEnd ? 'form-pair' : 'form-field'">
                        <DateField
                            v-model="date"
                            :label="editableEnd ? '开始日期' : '日期'"
                            :max="todayText()"
                            :disabled="locked"
                        />
                        <DateField
                            v-if="editableEnd"
                            v-model="endDate"
                            label="结束日期"
                            :max="todayText()"
                            :disabled="locked"
                        />
                    </div>
                    <div class="times form-pair">
                        <TimeField v-model="startTime" label="开始" />
                        <TimeField
                            v-if="mode === 'backfill' || editableEnd"
                            v-model="endTime"
                            label="结束"
                        />
                        <div v-else class="form-field end-time">
                            <span class="field-label">结束</span>
                            <output class="time-readout" aria-label="结束时刻">
                                {{ session?.endAt ? timeText(session.endAt) : '计时中' }}
                            </output>
                        </div>
                    </div>
                    <p v-if="mode === 'backfill'" class="note hint-line">
                        结束早于开始时，按次日算。
                    </p>
                </template>

                <div class="form-field">
                    <label class="field-label" :for="noteId">备注</label>
                    <input
                        :id="noteId"
                        v-model="note"
                        class="field"
                        type="text"
                        autocomplete="off"
                        maxlength="40"
                    />
                </div>

                <p v-if="error" class="note error" role="alert">{{ error }}</p>

                <p v-if="editing && session && ownersOf(session).length > 1" class="note meta">
                    旧记录由 {{ ownersOf(session).length }} 个号共用，点卡按人数分摊。
                </p>
            </fieldset>
        </form>

        <template #footer>
            <FormActions
                :error="writeError"
                :cancel-disabled="saving"
                :submit-text="submitText"
                :submit-label="submitText"
                :submit-disabled="!canSave"
                @cancel="close"
                @submit="submit"
            >
                <PressButton
                    v-if="editing"
                    danger
                    class="foot-left"
                    icon="trash"
                    :text="action === 'delete' ? '重试删除' : '删除'"
                    :disabled="saving || action === 'save'"
                    label="删掉这一段上线记录"
                    @click="remove"
                />
            </FormActions>
        </template>
    </ModalShell>
</template>

<style scoped>
.character-pick :deep(.bevel-pill) {
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
}

.times :deep(.time-input) {
    width: 100%;
    min-width: 0;
}
.end-time {
    align-items: stretch;
    gap: 6px;
    text-align: center;
}
.time-readout {
    display: grid;
    place-items: center;
    height: calc(56px * var(--fs-scale));
    color: var(--num);
    font-size: calc(var(--fs-xl) * 1.18);
    font-variant-numeric: tabular-nums;
}
.hint-line {
    margin: -6px 0 0;
}

.foot-left {
    margin-right: auto;
}
</style>
