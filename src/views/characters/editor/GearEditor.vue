<script setup lang="ts">
import { computed, ref } from 'vue';
import PressButton from '../../../components/PressButton.vue';
import IconTile from '../IconTile.vue';
import GearDetailForm from './GearDetailForm.vue';
import GearScreenshot from '../ocr/GearScreenshot.vue';
import { hasGearDetail, type GearSlot } from '../gear';
import { mergeGearPanel, type GearPanelResult } from '../ocr/gear-panel';
import { useGearIcon } from '../use-gear-icon';

/** 部位图标常驻，原图与详情并排；识别按实际部位更新草稿并选中该件。 */
const emit = defineEmits<{ busy: [value: boolean] }>();
const gear = defineModel<GearSlot[]>({ required: true });
const screenshot = ref<InstanceType<typeof GearScreenshot> | null>(null);
const reading = ref(false);
const selected = ref<string>(gear.value.find(filled)?.slot ?? gear.value[0]?.slot ?? '');
const active = computed(() => gear.value.find((slot) => slot.slot === selected.value) ?? null);
const filledCount = computed(() => gear.value.filter(filled).length);
function filled(slot: GearSlot): boolean {
    return Boolean(slot.caption?.trim()) || hasGearDetail(slot.detail);
}
function ensureDetail(slot: GearSlot) {
    slot.detail ??= { name: slot.caption ?? '', kind: '', stats: [] };
}
function selectByKey(key: string) {
    const slot = gear.value.find((one) => one.slot === key);
    if (!slot) return;
    const previous = active.value;
    if (previous?.detail && !filled(previous)) delete previous.detail;
    selected.value = key;
    ensureDetail(slot);
}
function clearByKey(key: string) {
    const slot = gear.value.find((one) => one.slot === key);
    if (!slot) return;
    slot.caption = '';
    delete slot.detail;
    screenshot.value?.clearShot(slot.slot);
    if (slot.slot === selected.value) ensureDetail(slot);
}
function recognize(result: GearPanelResult) {
    const index = gear.value.findIndex((slot) => slot.slot === result.slot);
    if (index < 0) return;
    gear.value[index] = mergeGearPanel(gear.value[index], result);
    selectByKey(gear.value[index].slot);
}
if (active.value) ensureDetail(active.value);
const slotIcon = useGearIcon();
</script>

<template>
    <div class="gear-editor">
        <GearScreenshot
            ref="screenshot"
            class="gear-editor-upload"
            :active-slot="active?.slot"
            multiple
            @recognize="recognize"
            @busy="
                reading = $event;
                emit('busy', $event);
            "
        >
            <template #navigation="{ shots }">
                <slot name="tabs" />
                <div class="gear-parts-head">
                    <span
                        >装备
                        <span class="gear-count">{{ filledCount }} / {{ gear.length }}</span></span
                    >
                    <PressButton
                        v-if="active && filled(active)"
                        icon="trash"
                        text="清空"
                        size="sm"
                        :label="'清空' + active.slot + '这一件'"
                        :disabled="reading"
                        @click="clearByKey(active.slot)"
                    />
                </div>
                <nav class="gear-parts" aria-label="装备部位">
                    <button
                        v-for="slot in gear"
                        :key="slot.slot"
                        class="gear-slot"
                        :class="{ filled: filled(slot), 'has-shot': Boolean(shots[slot.slot]) }"
                        type="button"
                        :aria-label="'编辑' + slot.slot + '的装备'"
                        :aria-pressed="selected === slot.slot"
                        :disabled="reading"
                        :title="slot.caption || slot.detail?.name || slot.slot"
                        @click="selectByKey(slot.slot)"
                    >
                        <IconTile v-if="slotIcon(slot)" class="slot-icon" :src="slotIcon(slot)" />
                        <span v-else class="slot-mark" aria-hidden="true">{{ slot.slot[0] }}</span>
                        <span class="slot-label">{{ slot.slot }}</span>
                    </button>
                </nav>
            </template>
            <GearDetailForm
                v-if="active?.detail"
                :key="active.slot"
                v-model="active.detail"
                v-model:caption="active.caption"
                :slot-name="active.slot"
            />
        </GearScreenshot>
    </div>
</template>

<style scoped>
.gear-editor {
    display: flex;
    flex: 1;
    min-width: 0;
    height: 100%;
    min-height: 0;
}
.gear-parts-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 20px;
    color: var(--ink-2);
    font-size: var(--fs-sm);
}
.gear-count {
    margin-left: 6px;
    color: var(--muted);
    font-size: var(--fs-mini);
    font-variant-numeric: tabular-nums;
}
.gear-parts {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 4px;
    padding-bottom: 10px;
    border-bottom: var(--w-hair) solid var(--rule-2);
}
.gear-slot {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    min-width: 0;
    padding: 5px 1px;
    border: var(--w-hair) solid transparent;
    border-radius: var(--r-2);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
}
.gear-slot .slot-icon {
    --tile-w: 30px;
    --tile-h: 30px;
    --shot: 26px;
}
.gear-slot:hover,
.gear-slot[aria-pressed='true'] {
    border-color: var(--rule-2);
    background: var(--paper-2);
    color: var(--ink);
}
.gear-slot[aria-pressed='true'] {
    border-color: var(--ochre);
}
.gear-slot.filled::after {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--moss);
    content: '';
}
.gear-slot.has-shot::after {
    width: 6px;
    height: 6px;
    background: var(--indigo-ink);
}
.slot-mark {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    font-size: var(--fs-md);
}
.slot-label {
    max-width: 100%;
    overflow: hidden;
    font-size: var(--fs-mini);
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
