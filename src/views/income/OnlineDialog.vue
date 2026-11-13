<script setup lang="ts">
import { computed, ref, watch, useId } from 'vue';
import DateField from '../../components/DateField.vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import TimeField from '../../components/TimeField.vue';
import TogglePills from '../../components/TogglePills.vue';
import { askConfirm } from '../../composables/use-confirm';
import { usePersistedSubmit } from '../../composables/use-persisted-submit';
import { notify } from '../../composables/use-notify';
import { dateText, todayText } from '../../services/format';
import { normalizeTime, timeText } from '../../services/clock';
import { useRoster } from '../characters/roster';
import { ownersOf, type OnlineSession } from './online';
import { useOnline } from './online-store';
import { characterOptions } from '../characters/character-options';
import { backfillDraft, backfillEndAt, onlineTimeAt as atOf } from './online-time';

const props = defineProps<{
    mode: 'start' | 'backfill' | 'edit';

    session?: OnlineSession;
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

function baseIds(): string[] {
    const one = props.session;
    if (!one) return [];

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
const note = ref(props.session?.note ?? '');

const busyIds = computed(() => {
    const busy = new Set<string>();
    for (const one of useOnline().sessions.value) {
        if (one.endAt !== null) continue;
        for (const id of ownersOf(one)) busy.add(id);
    }
    return busy;
});

const options = computed(() =>
    characterOptions(roster.value, baseIds()).map((one) => ({
        ...one,
        label: busyIds.value.has(one.value) ? `${one.label} · 在线中` : one.label,
        disabled: props.mode === 'start' && busyIds.value.has(one.value),
    })),
);

const error = ref('');

watch(
    [ids, date, startTime, endTime, note],
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
    const startAt = atOf(date.value, start);
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
    const result = updateOnline(props.session.id, {
        startAt,
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
            title: '删掉这一段上线记录？',
            note: '删了不能撤回，当天的点卡也会跟着减。',
            confirmText: '删除',
        });
        if (!ok) return;
    }
    const removed = await draft.run('delete', () => {
        removeOnline(one.id);
        return true;
    });
    if (!removed) return;
    notify.success('已删掉一段');
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
            <fieldset class="income-form" :disabled="locked">
                <div class="form-row">
                    <span class="field-label">记给谁</span>
                    <TogglePills
                        v-model="ids"
                        :options="options"
                        label="选择在线的角色"
                        radius="sm"
                    />
                    <p v-if="!roster.length" class="note error">
                        名册里还没有角色。先去角色页加一个，再回来记。
                    </p>
                </div>

                <template v-if="mode !== 'start'">
                    <div class="form-row">
                        <DateField v-model="date" label="日期" :max="todayText()" />
                    </div>
                    <div class="times">
                        <TimeField v-model="startTime" label="开始" />
                        <TimeField v-if="mode === 'backfill'" v-model="endTime" label="结束" />
                        <div v-else class="form-row end-time">
                            <span class="field-label">结束</span>
                            <output class="field time-readout" aria-label="结束时刻">
                                {{ session?.endAt ? timeText(session.endAt) : '计时中' }}
                            </output>
                        </div>
                    </div>
                    <p v-if="mode === 'backfill'" class="note hint-line">
                        结束早于开始时，按次日算。
                    </p>
                </template>

                <div class="form-row">
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

                <p v-if="error" class="note error">{{ error }}</p>

                <p v-if="editing && session && ownersOf(session).length > 1" class="note meta">
                    旧记录由 {{ ownersOf(session).length }} 个号共用，点卡按人数分摊。
                </p>
            </fieldset>
        </form>

        <template #footer>
            <p v-if="writeError" class="note error save-error" role="status">{{ writeError }}</p>
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
            <PressButton
                data-modal-cancel
                :disabled="saving"
                text="取消"
                label="取消"
                @click="close"
            />
            <PressButton
                icon="check"
                :text="submitText"
                :label="submitText"
                :disabled="!canSave"
                seal
                @click="submit"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
.form-row {
    display: grid;
    gap: 6px;
}

.times {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}

.times :deep(.time-input) {
    width: 100%;
    min-width: 0;
}
.end-time {
    align-content: start;
    text-align: center;
}
.time-readout {
    display: grid;
    place-items: center;
    height: calc(56px * var(--fs-scale));
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
