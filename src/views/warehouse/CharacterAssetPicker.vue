<script setup lang="ts">
/** 角色完整修改与单件修改共用仓库选择，确认只填入草稿。 */
import { ref } from 'vue';
import PressButton from '../../components/PressButton.vue';
import { lazyDialog } from '../../components/lazy-dialog';
import type { ReadonlyWarehouseItem, WarehouseKind } from './warehouse';

defineProps<{
    kind: WarehouseKind;
    gearSlot?: string;
    excludedIds?: readonly string[];
    single?: boolean;
    disabled?: boolean;
}>();
const emit = defineEmits<{ pick: [items: readonly ReadonlyWarehouseItem[]] }>();
const WarehouseDialog = lazyDialog(() => import('./WarehouseDialog.vue'));
const open = ref(false);
</script>

<template>
    <PressButton
        icon="archive"
        text="仓库"
        :label="kind === 'gear' ? '从仓库选择装备' : '从仓库选择召唤兽'"
        :disabled="disabled"
        @click="open = true"
    />
    <WarehouseDialog
        v-if="open"
        mode="equip"
        :asset-kind="kind"
        :gear-slot="gearSlot"
        :excluded-ids="excludedIds"
        :single="single"
        @pick="emit('pick', $event)"
        @close="open = false"
    />
</template>
