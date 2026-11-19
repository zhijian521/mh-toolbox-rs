<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '../../components/AppIcon.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import { lazyDialog } from '../../components/lazy-dialog';
import { notify } from '../../composables/use-notify';
import { openExternal } from '../../services/desktop';
import { readHomeShortcuts, saveHomeShortcuts } from '../../services/home-shortcuts';
import { useRoster } from '../characters/roster';
import ShortcutFace from './ShortcutFace.vue';
import { normalizeShortcutIds, shortcutsByIds, type HomeShortcut } from './shortcuts';

const WarehouseDialog = lazyDialog(() => import('../warehouse/WarehouseDialog.vue'));
const ShortcutEditor = lazyDialog(() => import('./ShortcutEditor.vue'));
const router = useRouter();
const { roster, loadError: rosterError } = useRoster();
const shortcutIds = ref(normalizeShortcutIds(readHomeShortcuts()));
const shortcuts = computed(() => shortcutsByIds(shortcutIds.value));
const customizingShortcuts = ref(false);
const shortcutSaveError = ref('');
const characterShortcut = ref<HomeShortcut | null>(null);
const warehouseOpen = ref(false);
function customizeShortcuts() {
    shortcutSaveError.value = '';
    customizingShortcuts.value = true;
}
function saveShortcuts(ids: string[]) {
    const next = normalizeShortcutIds(ids);
    if (!saveHomeShortcuts(next)) {
        shortcutSaveError.value = '常用功能未保存，请重试';
        return;
    }
    shortcutIds.value = next;
    customizingShortcuts.value = false;
}
function openCharacterShortcut(one: HomeShortcut, id: string) {
    characterShortcut.value = null;
    void router.push({
        path: one.path,
        query: { action: one.action, pane: one.pane, character: id },
    });
}
async function openShortcut(one: HomeShortcut) {
    if (one.dialog === 'warehouse') {
        warehouseOpen.value = true;
        return;
    }
    if (one.href) {
        if (!(await openExternal(one.href))) notify.error('没能打开浏览器');
        return;
    }
    if (one.pane) {
        if (rosterError.value) {
            notify.error(rosterError.value);
            return;
        }
        if (roster.value.length === 1) {
            openCharacterShortcut(one, roster.value[0].id);
            return;
        }
        characterShortcut.value = one;
        return;
    }
    void router.push({ path: one.path, query: { action: one.action } });
}
</script>

<template>
    <LedgerSection title="常用功能" class="shortcuts-section" plain>
        <template #actions
            ><PressButton
                icon="settings"
                text="自定义"
                label="自定义常用功能"
                size="sm"
                @click="customizeShortcuts"
        /></template>
        <div v-if="shortcuts.length" class="shortcut-grid">
            <button
                v-for="one in shortcuts"
                :key="one.id"
                type="button"
                class="workbench-shortcut"
                :data-shortcut-id="one.id"
                :aria-label="
                    one.text + '：' + one.description + (one.href ? '，在浏览器中打开' : '')
                "
                :title="one.description"
                @click="openShortcut(one)"
            >
                <ShortcutFace :one="one">
                    <template #suffix>
                        <AppIcon name="chevron-right" class="shortcut-arrow" />
                    </template>
                </ShortcutFace>
            </button>
        </div>
        <div v-else class="section-empty empty-note">
            <PressButton
                icon="add"
                text="添加功能"
                label="添加常用功能"
                @click="customizeShortcuts"
            />
        </div>
        <ShortcutEditor
            v-if="customizingShortcuts"
            :ids="shortcutIds"
            :error="shortcutSaveError"
            @save="saveShortcuts"
            @close="customizingShortcuts = false"
        />
        <WarehouseDialog v-if="warehouseOpen" @close="warehouseOpen = false" />
        <ModalShell
            v-if="characterShortcut"
            :title="'选择角色 · ' + characterShortcut.text"
            :width="420"
            @close="characterShortcut = null"
        >
            <div v-if="roster.length" class="shortcut-character-list">
                <PressButton
                    v-for="character in roster"
                    :key="character.id"
                    :text="character.name || '未命名'"
                    :label="'打开' + characterShortcut.text + '：' + character.name"
                    @click="openCharacterShortcut(characterShortcut, character.id)"
                />
            </div>
            <div v-else class="section-empty empty-note">
                <p>暂无角色</p>
                <PressButton
                    icon="add"
                    text="新增"
                    label="新建角色后使用此功能"
                    @click="router.push({ path: '/characters', query: { action: 'new' } })"
                />
            </div>
        </ModalShell>
    </LedgerSection>
</template>

<style scoped>
.shortcuts-section {
    --shortcut-min-w: calc(180px * var(--fs-scale));
    --shortcut-max-w: calc(260px * var(--fs-scale));
    display: flex;
    flex-direction: column;
}
.shortcuts-section :deep(.section-body) {
    flex: 1;
    display: flex;
}
.shortcut-grid {
    flex: 1;
    display: grid;
    width: 100%;
    max-width: calc(var(--shortcut-max-w) * 3 + 36px);
    grid-template-columns: repeat(
        auto-fill,
        minmax(min(100%, max(var(--shortcut-min-w), calc((100% - 32px) / 3))), 1fr)
    );
    gap: 12px 16px;
    align-content: start;
    padding: 2px 4px 6px 0;
}
.workbench-shortcut {
    display: flex;
    min-width: 0;
    width: 100%;
    max-width: var(--shortcut-max-w);
    justify-self: start;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    text-align: left;
    border-radius: var(--r-ticket);
}
.workbench-shortcut:focus-visible :deep(.shortcut-face) {
    background-color: var(--tile-face-hover);
}
.shortcut-arrow {
    --icon-size: calc(16px * var(--fs-scale));
    margin-left: auto;
    color: var(--muted);
}
.shortcut-character-list {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 6px 0;
}
</style>
