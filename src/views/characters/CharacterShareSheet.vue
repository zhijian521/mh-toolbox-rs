<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { glassLedger } from '../../components/glass-ledger';
import { todayText } from '../../services/format';
import CharacterCard from './CharacterCard.vue';
import GearTipContent from './GearTipContent.vue';
import IconTile from './IconTile.vue';
import { PANES, type ReadonlyCharacter } from './character';
import { characterShare } from './character-share';
import { useGearIcon } from './use-gear-icon';

const props = defineProps<{ character: ReadonlyCharacter }>();
const glass = inject(glassLedger, null);
const sheet = ref<HTMLDivElement>();
const shared = computed(() => characterShare(props.character));
const panels = computed(() =>
    PANES.filter(({ key }) => key !== 'gear').flatMap(({ key, label }) => {
        const characters =
            key === 'pets' && shared.value.pets.length
                ? shared.value.pets.map((pet) => ({ ...shared.value, pets: [pet] }))
                : [shared.value];
        return characters.map((character, index) => ({
            key,
            label,
            character: { ...character, id: `share-${key}-${index}` },
        }));
    }),
);
const { icon } = useGearIcon();
const summary = computed(() => {
    const { special, suit, soul } = shared.value.gearMeta;
    return [
        { label: '特技', value: special },
        { label: '套装', value: suit },
        ...(soul ?? []).map(({ label, value, extra }) => ({
            label: `命魂之玉 · ${label}`,
            value: [value, extra && `[${extra}]`].filter(Boolean).join(' '),
        })),
    ].filter(({ value }) => value);
});
defineExpose({ sheet });
</script>

<template>
    <div class="share-stage" inert aria-hidden="true">
        <div ref="sheet" class="character-sheet" :class="{ 'glass-sheet': glass }">
            <CharacterCard
                v-for="pane in panels"
                :key="pane.character.id"
                :character="pane.character"
                :pane="pane.key"
                :tabs="false"
                preview
                class="roster-card"
            >
                <template #header-end
                    ><span class="meta pane-label">{{ pane.label }}</span></template
                >
            </CharacterCard>
            <div class="equipment-grid">
                <article
                    v-for="slot in shared.gear"
                    :key="slot.slot"
                    class="detail-tip gear-tip on share-gear"
                >
                    <header class="gear-location meta">
                        <IconTile :src="icon(slot)" />{{ slot.slot }}
                    </header>
                    <GearTipContent
                        v-if="slot.detail"
                        :detail="slot.detail"
                        :fallback-name="slot.caption"
                        :slot-name="slot.slot"
                    />
                    <div v-else class="tip-name">{{ slot.caption }}</div>
                </article>
                <article
                    v-if="summary.length || !shared.gear.length"
                    class="detail-tip on share-gear"
                >
                    <div class="tip-name">{{ summary.length ? '装备汇总' : '装备' }}</div>
                    <div v-for="(row, i) in summary" :key="i" class="meta">
                        {{ row.label }} · {{ row.value }}
                    </div>
                    <p v-if="!summary.length" class="empty-note inline">暂无记录</p>
                </article>
            </div>
            <footer class="meta">{{ todayText() }}</footer>
        </div>
    </div>
</template>

<style scoped>
.share-stage {
    position: fixed;
    top: 0;
    left: -100000px;
    pointer-events: none;
}
.character-sheet {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: 14px;
    width: calc(2 * var(--char-w) + 54px);
    padding: 20px;
    background: var(--bg);
    color: var(--ink);
}
.glass-sheet {
    --char-w: var(--role-card-width);
    background: linear-gradient(140deg, light-dark(#c2dae5, #26323c), light-dark(#d5e4dc, #263a36));
}
.character-sheet .char {
    --char-h: auto;
    width: 100%;
}
/* SVG 快照里嵌套纸纹滤镜会盖黑纸面；保留原卡的门派渐变与纸棱。 */
.character-sheet .board.char {
    background-color: var(--character-paper);
    background-image: linear-gradient(
        135deg,
        color-mix(in srgb, var(--card-tint) var(--wash-a), var(--character-paper)),
        color-mix(in srgb, var(--card-tint) var(--wash-b), var(--character-paper))
    );
}
.character-sheet :deep(.char-body) {
    flex: none;
    overflow: visible;
}
.character-sheet :deep(.pane) {
    min-height: 0;
}
.character-sheet :deep(.skill-line),
.character-sheet :deep(.skill-icons) {
    height: auto;
    max-height: none;
    overflow: visible;
}
.pane-label {
    flex: none;
    margin-left: auto;
}
.share-gear.detail-tip {
    position: static;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    overflow-wrap: anywhere;
    transform: none;
}
.equipment-grid {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: inherit;
    align-items: start;
}
.gear-location {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
}
.share-gear :deep(.flavor) {
    display: block;
    overflow: visible;
}
/* PNG 快照会固化元素宽度；短词条按自身内容排，长词条仍受整行宽度限制。 */
.glass-sheet .share-gear :deep(.property-items.inline .property-item) {
    flex: 0 0 max-content;
    max-width: 100%;
}
.character-sheet footer {
    grid-column: 1 / -1;
    text-align: right;
}
</style>
