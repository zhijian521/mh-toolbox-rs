<script setup lang="ts">
import { computed, ref } from 'vue';
import DateField from '../../components/DateField.vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import TimeField from '../../components/TimeField.vue';
import TogglePills from '../../components/TogglePills.vue';
import { askConfirm } from '../../composables/use-confirm';
import { saved } from '../../composables/save-feedback';
import { notify } from '../../composables/use-notify';
import { parseDay, todayText } from '../../services/format';
import { normalizeTime } from '../../services/clock';
import { characterName, useRoster } from '../characters/roster';
import { ownersOf, type OnlineSession } from './online';
import { useOnline } from './online-store';

/**
 * 上线计时窗：三种模式共用一张表单。
 *
 * ---- 为什么合成一个窗而不是三个 ----
 * 三者的字段是同一组的子集：`开始计时` = 选号 + 现在，`补记` = 选号 + 时间区间，
 * `改一段` = 同一组字段的现值。拆成三个窗就有三份「选号」与三份校验，
 * 而校验恰恰是必须只有一份的东西（`online-store.ts` 里那些错误文案）。
 *
 * ---- 跨零点是自动的，但要说出来 ----
 * 结束时刻填得比开始早（22:00–01:00）时按**第二天**算，而不是报错：夜里的那段就是
 * 这么过去的，让用户去改日期是把常识变成一道题。提示写在结束时刻下面，才不是暗改。
 */
const props = defineProps<{
    mode: 'start' | 'backfill' | 'edit';
    /** `edit` 模式要改的那一段。 */
    session?: OnlineSession;
}>();

const emit = defineEmits<{ close: [] }>();

const { startOnline, backfillOnline, updateOnline, removeOnline, flush } = useOnline();
const { roster } = useRoster();

const editing = computed(() => props.mode === 'edit');

/* ---------- 表单状态 ---------- */

function baseIds(): string[] {
    const one = props.session;
    if (!one) return [];
    /* 名单为空 = 「只有主体角色」（`ownersOf` 的约定），这里把它摊开成可编辑的数组。 */
    return ownersOf(one);
}

const ids = ref<string[]>(baseIds());

function dateOf(ms: number): string {
    const at = new Date(ms);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

function timeOf(ms: number): string {
    const at = new Date(ms);
    return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

const date = ref(
    props.mode === 'backfill' ? todayText() : dateOf(props.session?.startAt ?? Date.now()),
);
const startTime = ref(
    props.mode === 'start' ? timeOf(Date.now()) : timeOf(props.session?.startAt ?? Date.now()),
);
const endTime = ref(timeOf(props.session?.endAt ?? Date.now()));
const note = ref(props.session?.note ?? '');

/* 补记的结束时刻初值给「一小时前 → 现在」：最常见的补记就是「刚下线，忘了点结束」。 */
if (props.mode === 'backfill') {
    endTime.value = timeOf(Date.now());
    startTime.value = timeOf(Date.now() - 60 * 60_000);
}

/**
 * 已经在计时的号：`start` 模式里禁掉并标「· 在线中」。
 *
 * 禁用而不是「选中就报错」：报错要等按了「开始」才知道，而这时人已经在想别的事了。
 */
const busyIds = computed(() => {
    const busy = new Set<string>();
    for (const one of useOnline().sessions.value) {
        if (one.endAt !== null) continue;
        for (const id of ownersOf(one)) busy.add(id);
    }
    return busy;
});

const options = computed(() =>
    roster.value.map((one) => ({
        value: one.id,
        label: busyIds.value.has(one.id) ? `${one.name} · 在线中` : one.name,
        disabled: props.mode === 'start' && busyIds.value.has(one.id),
    })),
);

/* ---------- 时刻拼成毫秒 ---------- */

/**
 * `日期 + HH:mm` → 毫秒。
 *
 * 走 `parseDay` 拿本地零点，再用 `setHours` 落时刻——不用 `new Date('2026-11-11 07:30')`：
 * 那种写法在不同引擎上按 UTC 或按本地解析，东八区会整体差八小时。
 */
function atOf(day: string, time: string): number {
    const at = parseDay(day);
    const [hour, minute] = time.split(':').map(Number);
    at.setHours(hour || 0, minute || 0, 0, 0);
    return at.getTime();
}

/** 结束时刻；比开始早时算第二天（跨零点）。 */
function endAtOf(startAt: number): number {
    const end = atOf(date.value, normalizeTime(endTime.value) ?? endTime.value);
    return end <= startAt ? end + 24 * 60 * 60_000 : end;
}

/* ---------- 校验 ---------- */

const error = ref('');

const canSave = computed(() => ids.value.length > 0 && !error.value);

/* ---------- 提交 ---------- */

async function submit() {
    error.value = '';

    if (ids.value.length === 0) {
        error.value = '先选一个号';
        return;
    }

    if (props.mode === 'start') {
        const result = startOnline({ characterIds: ids.value, note: note.value });
        if (!result.ok) {
            error.value = result.error;
            return;
        }
        if (await saved(flush)) notify.success('开始计时');
        emit('close');
        return;
    }

    if (props.mode === 'backfill') {
        const start = normalizeTime(startTime.value);
        const end = normalizeTime(endTime.value);
        if (!start) {
            error.value = '开始时刻认不出来，照 07:30 写';
            return;
        }
        if (!end) {
            error.value = '结束时刻认不出来，照 09:15 写';
            return;
        }
        const startAt = atOf(date.value, start);
        const result = backfillOnline({
            characterIds: ids.value,
            startAt,
            endAt: endAtOf(startAt),
            note: note.value,
        });
        if (!result.ok) {
            error.value = result.error;
            return;
        }
        if (await saved(flush)) notify.success('已补记一段');
        emit('close');
        return;
    }

    const one = props.session;
    if (!one) return;
    const start = normalizeTime(startTime.value);
    if (!start) {
        error.value = '开始时刻认不出来，照 07:30 写';
        return;
    }
    const result = updateOnline(one.id, {
        startAt: atOf(date.value, start),
        characterIds: ids.value,
        note: note.value,
    });
    if (!result.ok) {
        error.value = result.error;
        return;
    }
    if (await saved(flush)) notify.success('已改好');
    emit('close');
}

async function remove() {
    const one = props.session;
    if (!one) return;
    const ok = await askConfirm({
        title: '删掉这一段上线记录？',
        note: '删了不能撤回，当天的点卡也会跟着减。',
        confirmText: '删除',
    });
    if (!ok) return;
    removeOnline(one.id);
    if (await saved(flush)) notify.success('已删掉一段');
    emit('close');
}

const title = computed(() => {
    if (props.mode === 'start') return '开始计时';
    if (props.mode === 'backfill') return '补记一段';
    return '改这一段';
});

const submitText = computed(() =>
    props.mode === 'edit' ? '保存' : props.mode === 'start' ? '开始' : '补记',
);
</script>

<template>
    <ModalShell :title="title" :width="420" :scroll="false" @close="emit('close')">
        <form class="dialog-form" @submit.prevent="submit">
            <div class="form-row">
                <span class="field-label">记给谁</span>
                <TogglePills v-model="ids" :options="options" label="选择在线的角色" radius="sm" />
                <!-- 「随时上下其中某一个号」：多选不是「一组人共用一段」，而是**各记各的**。
                     不说清楚的话，选两个号会让人以为它俩从此绑在一起。 -->
                <p v-if="mode === 'start' && ids.length > 1" class="note hint-line">
                    选 {{ ids.length }} 个号就同时开
                    {{ ids.length }} 份计时，之后谁先下谁先停，互不影响。
                </p>
                <p v-if="!roster.length" class="note error">
                    名册里还没有角色。先去角色页加一个，再回来记。
                </p>
            </div>

            <!-- 开始计时只记「现在」：让人填开始时刻是没有意义的，那正是他要离开电脑去开游戏的那一刻。 -->
            <template v-if="mode !== 'start'">
                <div class="form-row">
                    <DateField v-model="date" label="日期" />
                </div>
                <div class="times">
                    <TimeField v-model="startTime" label="开始" />
                    <TimeField v-if="mode === 'backfill'" v-model="endTime" label="结束" />
                    <TimeField
                        v-else
                        :model-value="session?.endAt ? timeOf(session.endAt) : ''"
                        label="结束"
                    />
                </div>
                <p v-if="mode === 'backfill'" class="note hint-line">
                    结束比开始早时，按第二天算——夜里那一段本来就是这样过去的。
                </p>
                <p v-else class="note hint-line">
                    结束时刻由「结束计时」写，这里不给改；要改就删了重记。
                </p>
            </template>

            <div class="form-row">
                <span class="field-label">备注（可空）</span>
                <input
                    v-model="note"
                    class="field"
                    type="text"
                    placeholder="比如：摆摊 / 打宝图"
                    autocomplete="off"
                    maxlength="40"
                />
            </div>

            <p v-if="error" class="note error">{{ error }}</p>
            <!-- 老数据里可能存在「一组人共用一段」，那种段才会出现「摊」字；新记的都是一个号一条。 -->
            <p v-if="editing && session" class="note meta">
                <template v-if="ownersOf(session).length > 1">
                    这一段是老记录：{{ ownersOf(session).length }} 个号共用一段，点卡按人数摊。
                </template>
                <template v-else>
                    这一段记在 {{ characterName(roster, ownersOf(session)[0] ?? '') }} 名下。
                </template>
            </p>
        </form>

        <template #footer>
            <PressButton
                v-if="editing"
                class="foot-left"
                icon="trash"
                text="删除"
                label="删掉这一段上线记录"
                @click="remove"
            />
            <PressButton data-modal-cancel text="取消" label="取消" @click="emit('close')" />
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
.dialog-form {
    display: grid;
    gap: 14px;
}

.form-row {
    display: grid;
    gap: 6px;
}

/* 两个时刻并排：它们是同一件事的两端，竖着排会读成两个独立字段。 */
.times {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}

.hint-line {
    margin: -6px 0 0;
}

.foot-left {
    margin-right: auto;
}
</style>
