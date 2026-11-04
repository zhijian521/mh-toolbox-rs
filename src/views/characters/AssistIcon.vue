<script setup lang="ts">
/**
 * 辅助技能的图标：查一次名录，交给 `IconTile` 画。
 *
 * 这一层只解决「查哪张图」——生活与剧情是两套图（`skill-*` / `story-*`），只给名字
 * 分不出是哪一套，所以 `kind` 必须一起传。
 *
 * **纸化那一套材质不在这里**：2026-11-04 门派技能也从首字印换成真图标，
 * 同一枚「压印块 + sepia」要是再抄一遍，两批图迟早漂成两种色——它搬进了
 * `IconTile`，这里只留查表。
 */
import { computed } from 'vue';
import IconTile from './IconTile.vue';
import { assistIcon } from '../../services/game-icons';

const props = defineProps<{
    /** 技能名，用于查图标（`services/game-icons.ts`）。 */
    name: string;
    /** 生活 / 剧情是两套图标（`skill-*` / `story-*`），只给名字分不出是哪一套。 */
    kind: 'life' | 'story';
}>();

/* 名字不在名录里（用户自己敲的、或游戏新加的）时给 `undefined`：那时**不画图**，
 * 只留一块空块，不留一个破图。 */
const src = computed(() => assistIcon(props.name, props.kind));
</script>

<template>
    <IconTile :src="src" />
</template>
