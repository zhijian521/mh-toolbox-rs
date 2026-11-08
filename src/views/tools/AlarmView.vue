<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AlarmCard from './AlarmCard.vue';
import AlarmDialog from './AlarmDialog.vue';
import AppIcon from '../../components/AppIcon.vue';
import PageShell from '../../components/PageShell.vue';
import PressButton from '../../components/PressButton.vue';
import { askConfirm } from '../../composables/use-confirm';
import { notify } from '../../composables/use-notify';
import { MAX_ALARMS, type AlarmDraft, type AlarmLike } from './alarms';
import { useAlarms } from './alarm-store';

/**
 * 闹钟页：一屏摆着几个闹钟，每张卡一个。
 *
 * 三段，没有第四段：`页头` / `卡片网格` / `空态`。**不套最外层的卡片**——与物价、角色、
 * 工具页同一条：`PageShell` 下面直接就是一张张纸卡。
 *
 * ---- 这一页只负责「摆」与「开窗」----
 *
 * 数据在 `useAlarms()`（模块级单例），提醒的计时在 `AlarmHost`（全站一个，挂在外壳里）。
 * 这一页不自己算什么时候响：它只每 30 秒刷新一次「现在几点」，卡片拿它算倒计时。
 * 两处各算一份时间的话，卡片说「1 分钟后」、提示却在半分钟后就弹，用户会以为它不准。
 *
 * ---- 为什么每 30 秒而不是每秒 ----
 *
 * 显示的最小单位是「分钟」（`29 分钟后`），秒级刷新只会让屏幕每秒钟动一次，
 * 而那一格字一分钟里只变一次。30 秒是为了「跨分钟时最多晚半分钟」，肉眼可接受，
 * 又不至于让一个后台页面每秒醒一次。
 */
const { alarms, error, add, update, remove, setEnabled } = useAlarms();

/* 返回工具目录。用 `push('/tools')` 而不是 `router.back()`：这一页可能由地址直接进
 * （刷新、收藏），此时「上一页」是空的或者别的站外页面；工具子页的上一级永远只有
 * 目录一个，写死它才符合「返回」在这张纸上唯一的意思。 */
const router = useRouter();

/* 当前时刻。卡片拿它算「还有多久」。 */
const now = ref(new Date());
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
    timer = setInterval(() => {
        now.value = new Date();
    }, 30_000);
    /* 窗口从最小化回来 / 休眠恢复时立刻对一次：`setInterval` 在后台会被节流成
     * 一分钟一次，回来时 `now` 可能还停在十分钟前，倒计时会先跳一下。 */
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
});

onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
    window.removeEventListener('focus', refresh);
    document.removeEventListener('visibilitychange', onVisible);
});

function refresh() {
    now.value = new Date();
}

function onVisible() {
    if (document.visibilityState === 'visible') refresh();
}

/* ---------- 弹窗 ---------- */
const dialogOpen = ref(false);
const editing = ref<AlarmLike | null>(null);
const dialogError = ref('');
/* 换编辑对象时让弹窗重建（`:key`），否则草稿还停在上一个闹钟的值上。 */
const dialogKey = ref(0);

function openNew() {
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
    /* 先留一份引用：`closeDialog()` 会把 `editing` 清空，之后再判就成了「永远在新增」。 */
    notify.success(target ? '已改这个闹钟' : '已加一个闹钟');
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
        title: `删掉 ${alarm.time} 这个闹钟？`,
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
</script>

<template>
    <PageShell title="闹钟" desc="到点前一分钟提醒 · 不在这一页也会提示 · 仅存本机">
        <template #actions>
            <!-- 与捉鬼页同一枚：图标先读动作方向，字只写动词，完整语义在 `label` 里。
                 排在最左——页头的右端留给主操作（这里是「新增」）。 -->
            <PressButton
                icon="back"
                text="返回"
                label="返回工具列表"
                @click="router.push('/tools')"
            />
            <!-- 到上限时按钮不置灰：置灰说不出「为什么点不动」。点下去由 `openNew` 说一句。 -->
            <PressButton icon="add" text="新增" label="新增一个闹钟" seal @click="openNew" />
        </template>

        <p v-if="error" class="note error alarm-error">{{ error }}</p>

        <div v-if="alarms.length" class="alarm-grid">
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

        <div v-else class="alarm-void">
            <AppIcon name="alarm" class="void-icon" />
            <h3>设第一个闹钟</h3>
            <p class="note">提醒在时刻前一分钟出来，几个闹钟可以一起管。</p>
            <PressButton icon="add" text="新增" label="设第一个闹钟" seal @click="openNew" />
        </div>

        <AlarmDialog
            v-if="dialogOpen"
            :key="dialogKey"
            :alarm="editing"
            :error="dialogError"
            @save="onSave"
            @close="closeDialog"
        />
    </PageShell>
</template>

<style scoped>
/* ---------- 网格 ----------
 * 与物价页同一套：`minmax(200px, 225px)` 自动铺，左对齐。窄窗口时一行两张，
 * 宽窗口时一行五六张——卡宽不跟着窗口拉伸，与价签、目标卡是同一种「一张一张摆」。
 */
.alarm-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 225px));
    justify-content: start;
    gap: 12px;
    align-items: stretch;
}

.alarm-error {
    margin: 0 0 10px;
}

/* ---------- 空态 ----------
 * 三样都在：一枚图标、一句话、一枚按钮。读者才知道「这里本来该有什么」与「从哪开始」。
 * 与物价页的空态同一个结构，只是图标换成闹钟。
 */
.alarm-void {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 46px 0 40px;
    text-align: center;
}
.void-icon {
    /* 空态图标比正文里的大两档；走 `--icon-size` 才跟字号档一起缩放。 */
    --icon-size: calc(34px * var(--fs-scale));

    color: var(--rule-2);
}
.alarm-void h3 {
    margin: 0;
    color: var(--ink);
}
.alarm-void .note {
    margin: 0;
}
</style>
