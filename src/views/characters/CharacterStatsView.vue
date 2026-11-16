<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageShell from '../../components/PageShell.vue';
import PressButton from '../../components/PressButton.vue';
import LoadNotice from '../../components/LoadNotice.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import CharacterCard from './CharacterCard.vue';
import { PANES, PANE_OPTIONS, type PaneKey, type ReadonlyCharacter } from './character';
import { loadRoster, useRoster } from './roster';
import { gameDataReady } from '../../services/game-data';

const route = useRoute();
const router = useRouter();
const { roster, loadError, pending, writeError } = useRoster();
const pane = computed<PaneKey>({
    get: () => PANES.find((item) => item.key === route.query.pane)?.key ?? 'attrs',
    set: (value) => {
        void router.replace({ query: { ...route.query, pane: value } });
    },
});
function editCharacter(character: ReadonlyCharacter, target: PaneKey) {
    void router.push({
        path: '/characters',
        query: { action: 'edit', character: character.id, pane: target },
    });
}
</script>

<template>
    <PageShell title="角色统计" desc="全队档案 · 同页对照">
        <template #actions>
            <PressButton
                icon="back"
                text="返回"
                label="返回角色页面"
                @click="router.push({ name: 'characters' })"
            />
        </template>

        <LoadNotice :error="loadError" :load="loadRoster" :blocked="pending > 0 || !!writeError" />
        <template v-if="!loadError">
            <div class="stats-controls page-filters">
                <SteppedSlider v-model="pane" :options="PANE_OPTIONS" label="角色统计分区" />
                <span class="stats-count num" aria-live="polite"> {{ roster.length }} 个角色 </span>
            </div>
            <div v-if="roster.length" class="stats-grid">
                <CharacterCard
                    v-for="character in roster"
                    :key="character.id"
                    :character="character"
                    :pane="pane"
                    :tabs="false"
                    edit-shortcut
                    :disabled="pending > 0 || !!writeError || !gameDataReady"
                    preview
                    compact
                    @edit="editCharacter(character, $event)"
                />
            </div>
            <p v-else class="empty-note">还没有记录角色</p>
        </template>
    </PageShell>
</template>

<style scoped>
.stats-controls {
    gap: 10px;
}

.stats-count {
    margin-left: auto;
    color: var(--muted);
    font-size: var(--fs-sm);
    white-space: nowrap;
}

.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 360px);
    justify-content: start;
    align-items: start;
    gap: 14px;
}
</style>
