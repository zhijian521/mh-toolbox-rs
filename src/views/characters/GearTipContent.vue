<script setup lang="ts">
import type { ReadonlyGearDetail, GearSlotName } from './gear';
import GearProperties from './GearProperties.vue';

defineProps<{ detail: ReadonlyGearDetail; slotName?: GearSlotName; fallbackName?: string }>();
</script>

<template>
    <div class="tip-name">{{ detail.name || fallbackName || slotName }}</div>
    <div class="meta tip-kind">
        {{ detail.kind }}<template v-if="detail.level"> · {{ detail.level }} 级</template
        ><template v-if="detail.requires?.length"> · {{ detail.requires?.join(' · ') }}</template>
    </div>
    <!-- 风味文本压到两行：它是「这件东西有来历」，不是要背下来的属性。
         排在属性之前是为了先给个由头，但绝不能让它把属性挤出屏幕。 -->
    <p v-if="detail.flavor" class="flavor">{{ detail.flavor }}</p>

    <GearProperties :detail="detail" :slot-name="slotName" />

    <div v-if="detail.foot" class="meta tip-foot">{{ detail.foot }}</div>
    <div v-if="detail.note" class="meta tip-note"><span>备注</span>{{ detail.note }}</div>
</template>
