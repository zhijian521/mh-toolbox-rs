<script setup lang="ts">
import { GlassSwitch } from './index';

const checked = defineModel<boolean>('checked', { required: true });
</script>

<template>
    <GlassSwitch v-model:checked="checked" class="lg-small-switch" />
</template>

<style scoped>
glass-switch.lg-small-switch {
    zoom: 0.6875;
    margin-block: 9px;
}
/* 命中区延伸到预留间距，拖动和键盘仍由同一个 switch 处理。 */
glass-switch.lg-small-switch::before {
    content: '';
    position: absolute;
    inset: -9px 0;
}
</style>
