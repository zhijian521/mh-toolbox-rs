<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { glassLedger } from '../../components/glass-ledger';
import { useMinuteNow } from '../../composables/use-minute-now';
import { useRouteAction } from '../../composables/use-route-action';
import LoadNotice from '../../components/LoadNotice.vue';
import AlarmCard from './AlarmCard.vue';
import AlarmDialog from './AlarmDialog.vue';
import AppIcon from '../../components/AppIcon.vue';
import ToolPageShell from './ToolPageShell.vue';
import PressButton from '../../components/PressButton.vue';
import { askConfirm } from '../../composables/use-confirm';
import { notify } from '../../composables/use-notify';
import { LEAD_MINUTES, MAX_ALARMS, type AlarmDraft, type AlarmLike } from './alarms';
import { useAlarms } from './alarm-store';

/** 闹钟页负责列表与编辑入口，提醒调度和倒计时共用全局分钟时钟。 */
const { alarms, error, loadError, retryLoad, add, update, remove, setEnabled } = useAlarms();
const glass = inject(glassLedger, null);

const minuteNow = useMinuteNow();
const now = computed(() => new Date(minuteNow.value));

/* ---------- 弹窗 ---------- */
const dialogOpen = ref(false);
const editing = ref<AlarmLike | null>(null);
const dialogError = ref('');
/* 换编辑对象时让弹窗重建（`:key`），否则草稿还停在上一个闹钟的值上。 */
const dialogKey = ref(0);

function openNew() {
    if (loadError.value) return;
    if (alarms.value.length >= MAX_ALARMS) {
        notify.error(`最多 ${MAX_ALARMS} 个，先删掉几个`);
        return;
    }
    editing.value = null;
    dialogError.value = '';
    dialogKey.value += 1;
    dialogOpen.value = true;
}

function openEdit(alarm: AlarmLike) {
    editing.value = alarm;
    dialogError.value = '';
    dialogKey.value += 1;
    dialogOpen.value = true;
}

function closeDialog() {
    dialogOpen.value = false;
    editing.value = null;
    dialogError.value = '';
}

function onSave(draft: AlarmDraft) {
    const target = editing.value;
    const result = target ? update(target.id, draft) : add(draft);
    if (!result.ok) {
        /* 留在窗内显示：关掉窗再报错，用户得把刚填的四格重来一遍。 */
        dialogError.value = result.error;
        return;
    }
    closeDialog();
    notify.success('已保存');
}

/* ---------- 停用 / 启用 ---------- */
function onToggle(alarm: AlarmLike, enabled: boolean) {
    const result = setEnabled(alarm.id, enabled);
    if (!result.ok) notify.error(result.error);
    else notify.info(enabled ? '已开启' : '已停用');
}

/* ---------- 删除 ---------- */
async function askRemove(alarm: AlarmLike) {
    const ok = await askConfirm({
        danger: true,
        title: `删除 ${alarm.time} 这个闹钟？`,
        note: alarm.label ? `「${alarm.label}」删了没法撤回。` : '删了没法撤回。',
        confirmText: '删除',
    });
    if (!ok) return;

    const result = remove(alarm.id);
    if (!result.ok) {
        notify.error(result.error);
        return;
    }
    notify.success('已删除');
}
useRouteAction('/tools/alarm', { new: openNew });
</script>

<template>
    <ToolPageShell
        title="闹钟"
        desc="定时提醒 · 应用运行时生效"
        class="alarm-page"
        :class="{ 'is-glass': glass }"
    >
        <template #actions>
            <!-- 到上限时按钮不置灰：置灰说不出「为什么点不动」。点下去由 `openNew` 说一句。 -->
            <PressButton
                icon="add"
                text="新增"
                label="新增一个闹钟"
                :seal="!!glass"
                :disabled="!!loadError"
                @click="openNew"
            />
        </template>

        <LoadNotice :error="loadError" :load="retryLoad" />
        <p v-if="error" class="note error alarm-error" role="alert">{{ error }}</p>

        <div v-if="alarms.length" class="alarm-grid compact-card-grid">
            <AlarmCard
                v-for="alarm in alarms"
                :key="alarm.id"
                :alarm="alarm"
                :now="now"
                @edit="openEdit(alarm)"
                @remove="askRemove(alarm)"
                @toggle-enabled="onToggle(alarm, $event)"
            />
        </div>

        <component
            :is="glass?.card ?? 'div'"
            v-else-if="!loadError"
            v-bind="glass ? { radius: 15 } : {}"
            class="alarm-void page-empty"
        >
            <AppIcon name="alarm" class="void-icon page-empty-icon" />
            <h3>设第一个闹钟</h3>
            <p class="note">应用运行时，提前 {{ LEAD_MINUTES }} 分钟提醒。</p>
            <PressButton icon="add" text="新增" label="设第一个闹钟" @click="openNew" />
        </component>

        <AlarmDialog
            v-if="dialogOpen"
            :key="dialogKey"
            :alarm="editing"
            :error="dialogError"
            @save="onSave"
            @close="closeDialog"
        />
    </ToolPageShell>
</template>

<style scoped>
.alarm-error {
    margin: 0 0 10px;
}
.is-glass .alarm-grid {
    grid-template-columns: repeat(
        auto-fill,
        minmax(min(100%, calc(204px * var(--fs-scale))), calc(224px * var(--fs-scale)))
    );
    gap: 10px;
}
.is-glass .alarm-void {
    --glass-foreground: var(--liquid-ink);
    --glass-text-shadow: none;
    width: min(100%, 300px);
    min-height: 0;
    margin: 20px auto;
    padding: 18px 14px;
    justify-content: center;
}
</style>
