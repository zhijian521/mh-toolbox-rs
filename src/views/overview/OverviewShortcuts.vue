<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '../../components/AppIcon.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import PressTile from '../../components/PressTile.vue';
import { notify } from '../../composables/use-notify';
import { openExternal } from '../../services/desktop';
import { readHomeShortcuts, saveHomeShortcuts } from '../../services/home-shortcuts';
import { useRoster } from '../characters/roster';
import ShortcutEditor from './ShortcutEditor.vue';
import { normalizeShortcutIds, shortcutsByIds, type HomeShortcut } from './shortcuts';

const router = useRouter();
const { roster, loadError: rosterError } = useRoster();
const shortcutIds = ref(normalizeShortcutIds(readHomeShortcuts()));
const shortcuts = computed(() => shortcutsByIds(shortcutIds.value));
const customizingShortcuts = ref(false);
const shortcutSaveError = ref('');
const characterShortcut = ref<HomeShortcut | null>(null);
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
    <LedgerSection title="常用功能" class="shortcuts-section">
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
                :data-tone="one.tone"
                :aria-label="
                    one.text + '：' + one.description + (one.href ? '，在浏览器中打开' : '')
                "
                :title="one.description"
                @click="openShortcut(one)"
            >
                <PressTile class="shortcut-face">
                    <span class="shortcut-icon"><AppIcon :name="one.icon" /></span>
                    <span class="shortcut-copy">
                        <span class="shortcut-name">{{ one.text }}</span>
                        <small>{{ one.description }}</small>
                    </span>
                </PressTile>
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
    align-self: start;
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
    grid-template-columns: repeat(
        auto-fill,
        minmax(min(100%, max(calc(126px * var(--fs-scale)), calc((100% - 30px) / 4))), 1fr)
    );
    gap: 10px;
    align-content: start;
    padding: 2px 0 5px;
}
.workbench-shortcut {
    --shortcut-ink: var(--accent);
    --tile-face: color-mix(in srgb, var(--shortcut-ink) 5%, var(--paper));
    --tile-face-hover: color-mix(in srgb, var(--shortcut-ink) 9%, var(--paper));
    --tile-face-active: color-mix(in srgb, var(--shortcut-ink) 6%, var(--well));
    display: flex;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    text-align: left;
}
.workbench-shortcut[data-tone='indigo'] {
    --shortcut-ink: var(--indigo-ink);
}
.workbench-shortcut[data-tone='moss'] {
    --shortcut-ink: var(--moss);
}
.workbench-shortcut[data-tone='ochre'] {
    --shortcut-ink: var(--ochre);
}
.shortcut-face {
    --tile-w: 100%;
    --tile-h: auto;
    --tile-r: var(--r-2);
    --tile-drop: 1.4;
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: calc(76px * var(--fs-scale));
    padding: 9px 10px;
}
.shortcut-face :deep(.press-content) {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    width: 100%;
    height: 100%;
    min-width: 0;
}
.shortcut-face::after {
    content: '';
    position: absolute;
    top: 7px;
    right: 7px;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--shortcut-ink) 30%, transparent);
    box-shadow:
        inset 0 1px 1px var(--shadow),
        0 1px 0 var(--bevel-hi);
}
.workbench-shortcut:hover .shortcut-face {
    transform: translateY(-2px);
}
.workbench-shortcut:active .shortcut-face {
    transform: translateY(3px);
}
.shortcut-icon {
    display: grid;
    place-items: center;
    flex: none;
    width: calc(20px * var(--fs-scale));
    height: calc(20px * var(--fs-scale));
    color: var(--shortcut-ink);
}
.shortcut-icon :deep(.app-icon) {
    --icon-size: calc(19px * var(--fs-scale));
}
.shortcut-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
}
.shortcut-name {
    font-size: var(--fs-sm);
    color: var(--shortcut-ink);
}
.shortcut-copy small {
    font-size: var(--fs-mini);
    color: var(--muted);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.shortcut-character-list {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 6px 0;
}
</style>
