<script setup lang="ts">
import { lazyDialog } from '../components/lazy-dialog';
import SaveNotice from '../components/SaveNotice.vue';
import LoadNotice from '../components/LoadNotice.vue';
import { computed, inject, nextTick, onScopeDispose, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useRouteAction } from '../composables/use-route-action';
import PageShell from '../components/PageShell.vue';
import LiquidLedgerFrame from '../components/LiquidLedgerFrame.vue';
import { glassLedger } from '../components/glass-ledger';
import PressButton from '../components/PressButton.vue';
import { notify } from '../composables/use-notify';
import { usePersistedSubmit } from '../composables/use-persisted-submit';
import { useConfirmedRemoval } from '../composables/use-confirmed-removal';
import CharacterCard from './characters/CharacterCard.vue';
import type { QuickTarget } from './characters/quick/quick-target';
import { PANES, type ReadonlyCharacter, type PaneKey } from './characters/character';
import { emptyCharacter, loadRoster, useRoster } from './characters/roster';
import { goalsOfCharacter, useGoals } from './goals/goals-store';
import { gameDataError, gameDataLoading, gameDataReady, loadGameData } from '../services/game-data';

const props = defineProps<{
    reloadRoster?: () => Promise<void>;
    ensureGoals?: () => Promise<void>;
}>();
const glass = inject(glassLedger, null);

const CharacterHistory = lazyDialog(() => import('./characters/CharacterHistory.vue'));
const CharacterEditor = lazyDialog(() => import('./characters/CharacterEditor.vue'));
const QuickEdit = lazyDialog(() => import('./characters/quick/QuickEdit.vue'));
const WarehouseDialog = lazyDialog(() => import('./warehouse/WarehouseDialog.vue'));
const warehouseOpen = ref(false);

const { roster, loadError, writeError, pending, flush, retry, add, update, remove } = useRoster();
const route = useRoute();
const historyOpen = ref(false);
const preparingRemoval = ref(false);
const goals = useGoals();
let active = true;
onScopeDispose(() => {
    active = false;
});
watch(
    () => route.query.character,
    async (id) => {
        if (typeof id !== 'string') return;
        await nextTick();
        const card = document.getElementById('character-' + id);
        if (!card) return;
        card.scrollIntoView({ block: 'start', inline: 'nearest' });
        card.focus({ preventScroll: true });
    },
    { immediate: true, flush: 'post' },
);
const submission = usePersistedSubmit(flush, retry);
const { saving, locked, action } = submission;
const removal = useConfirmedRemoval(
    () => pending.value > 0 || Boolean(loadError.value || writeError.value) || !gameDataReady.value,
    flush,
);
const { removing } = removal;
const editingDisabled = computed(
    () =>
        !!loadError.value ||
        !gameDataReady.value ||
        pending.value > 0 ||
        removing.value ||
        preparingRemoval.value,
);

function openEditor(character: ReadonlyCharacter, pane: PaneKey) {
    if (editingDisabled.value) return;
    submission.reset();
    editing.value = { character, pane, isNew: false };
}

async function retryGameData() {
    await (props.reloadRoster ?? loadGameData)();
}

/** 新建或修改由打开时固定，内存先新增而落盘失败时仍保持新建模式。 */
const editing = ref<{ character: ReadonlyCharacter; pane: PaneKey; isNew: boolean } | null>(null);

/**
 * 正在「快速修改」的那一项，`null` = 关着。
 *
 * 与整份角色编辑分开保存状态，旧窗口的异步保存不能关闭后来打开的窗口。
 *
 * 带上 `character` 而不是只带 id：快速修改要读现值来填那几格，`roster` 里那一份
 * 就是点开那一刻的，不另存快照——保存时算出来的新整份会按 id 整条替换。
 */
const quicking = ref<{ character: ReadonlyCharacter; target: QuickTarget } | null>(null);

function openQuick(character: ReadonlyCharacter, target: QuickTarget) {
    if (editingDisabled.value) return;
    submission.reset();
    quicking.value = { character, target };
}

/* 快速修改的保存：与编辑器共用 `update()`，写入路径只有这一条。
 * `applyQuick` 已经返回**完整的一份**（只替换那一项），所以这里不必再合并。 */
async function onQuickSave(next: ReadonlyCharacter) {
    if (pending.value > 0 || editingDisabled.value) return;
    const source = quicking.value;
    if (!source) return;
    const ok = await submission.run('save', () => {
        return update(next);
    });
    if (ok && quicking.value === source) closeQuick();
}

function closeEditor() {
    if (saving.value) return;
    editing.value = null;
    submission.reset();
}

function closeQuick() {
    if (saving.value) return;
    quicking.value = null;
    submission.reset();
}

function startNew() {
    if (editingDisabled.value) return;
    submission.reset();
    editing.value = { character: emptyCharacter(), pane: 'attrs', isNew: true };
}

async function onSave(character: ReadonlyCharacter) {
    if (pending.value > 0 || editingDisabled.value) return;
    const source = editing.value;
    if (!source) return;
    const ok = await submission.run('save', () => {
        if (!source.isNew) return update(character);
        add(character);
        return roster.value.some((item) => item.id === character.id);
    });
    if (ok && editing.value === source) closeEditor();
}

/* 删角色要问一次：名册删掉就没有回收站。问句与后果在这里，卡上只负责把这枚按钮画出来
 * ——二次确认全站只有一个入口（`askConfirm()`），卡上再自绘一套「按钮就地改名」，
 * 就会出现第二种问法、时限、文案、误触保护各写一遍。
 *
 * **有目标引用他时必须说出来**（用户 2026-11-05 定）：目标的成员是建目标那一刻的快照，
 * 人删了之后卡片上那一行会变成「已删除」并不再计入分母——不说的话，用户是在回到目标页
 * 时才发现「5 个角色达标」变成了「4 个角色达标」。 */
async function askRemove(character: ReadonlyCharacter) {
    if (editingDisabled.value) return;
    if (props.ensureGoals) {
        preparingRemoval.value = true;
        try {
            await props.ensureGoals();
        } finally {
            preparingRemoval.value = false;
        }
        if (!active) return;
        if (goals.loadError.value || !goals.loaded.value) {
            notify.error('无法读取关联目标，请稍后重试删除');
            return;
        }
        if (editingDisabled.value) return;
    }
    const name = character.name || '这个角色';
    const related = goalsOfCharacter(character.id);
    const titles = related
        .slice(0, 3)
        .map((goal) => `「${goal.title}」`)
        .join('、');
    await removal.run(
        {
            danger: true,
            title: `删掉「${name}」？`,
            note: related.length
                ? `删了之后名册里就没有这个人了，没法撤回。他还在 ${related.length} 个目标里` +
                  `（${titles}${related.length > 3 ? ' 等' : ''}）——删掉后那些目标不再计入他。`
                : '删了之后名册里就没有这个人了，没法撤回。',
            confirmText: '删除',
        },
        () => remove(character.id),
    );
}

useRouteAction('/characters', {
    new: startNew,
    edit(query) {
        const character = roster.value.find((one) => one.id === query.character);
        const pane = PANES.find((one) => one.key === query.pane)?.key ?? 'attrs';
        if (character) openEditor(character, pane);
    },
});
</script>

<template>
    <component
        :is="glass ? LiquidLedgerFrame : PageShell"
        :class="glass ? 'liquid-characters' : undefined"
        title="角色"
        desc="角色档案"
    >
        <template #actions>
            <PressButton
                icon="history"
                text="历史"
                label="查看角色成长历史"
                :disabled="!!loadError"
                @click="historyOpen = true"
            />
            <PressButton
                icon="archive"
                text="仓库"
                label="打开装备和召唤兽仓库"
                @click="warehouseOpen = true"
            />
            <PressButton
                icon="add"
                text="新增"
                label="新建角色"
                seal
                :disabled="editingDisabled"
                @click="startNew"
            />
        </template>

        <!-- 数据层的那一行红字：`loadError` 是「整份读不出」，`writeError` 是「刚那一笔没写进去」。
             两者都必须显示——读失败时名册本来就是空的，用户看到的是一张空页，不说清楚就会以为
             「角色都没了」然后重填一遍；而底层此刻拒绝写入，他重建的东西同样存不下去。
             样式只用现成的 `.note.error`（`base.css` 的朱色状态），不新造类。 -->
        <LoadNotice
            :error="loadError"
            :load="props.reloadRoster ?? loadRoster"
            :blocked="pending > 0 || !!writeError || !!editing || !!quicking || removing || preparingRemoval"
        />
        <p v-if="!gameDataReady" class="note error" role="alert">
            {{ gameDataError || '正在加载游戏数据，暂时无法修改角色' }}
            <PressButton
                text="重试"
                label="重试加载角色游戏数据"
                size="sm"
                :disabled="gameDataLoading"
                @click="retryGameData"
            />
        </p>
        <SaveNotice
            v-if="!editing && !quicking"
            :error="writeError"
            :pending="pending"
            @retry="retry"
        />

        <p v-if="!loadError && !roster.length" class="empty-note">还没有角色，点击右上角新增</p>
        <div v-else-if="!loadError" class="roster">
            <!-- `quick`：点卡上的行 / 格就开「快速修改」。开关状态在**页面**这一层
                 （`quicking`），卡片只把「点了什么」抛上来——卡是循环渲染的，
                 每张卡各存一个弹窗状态就等于开了 N 个窗。 -->
            <CharacterCard
                v-for="character in roster"
                :key="character.id"
                :character="character"
                class="roster-card"
                :class="{ 'is-linked': route.query.character === character.id }"
                :quick="!editingDisabled"
                :disabled="editingDisabled"
                @edit="(pane) => openEditor(character, pane)"
                @remove="askRemove(character)"
                @quick="(target) => openQuick(character, target)"
            />
        </div>

        <CharacterEditor
            v-if="editing"
            :key="editing.character.id"
            :character="editing.character"
            :pane="editing.pane"
            :is-new="editing.isNew"
            :saving="saving || pending > 0"
            :locked="locked"
            :retrying="action !== null"
            :save-error="writeError"
            @save="onSave"
            @cancel="closeEditor"
        />

        <QuickEdit
            v-if="quicking"
            :character="quicking.character"
            :target="quicking.target"
            :saving="saving || pending > 0"
            :locked="locked"
            :retrying="action !== null"
            :save-error="writeError"
            @save="onQuickSave"
            @close="closeQuick"
        />
    </component>
    <CharacterHistory v-if="historyOpen" @close="historyOpen = false" />
    <WarehouseDialog v-if="warehouseOpen" @close="warehouseOpen = false" />
</template>

<style scoped>
.roster {
    container: character-roster / inline-size;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 14px;
}

.roster-card.is-linked {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
    scroll-margin: 12px;
}
</style>
