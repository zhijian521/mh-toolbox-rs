<script setup lang="ts">
/**
 * 辅助技能的图标：一块**压印块** + 一张过了「纸化」的图。
 *
 * 为什么单独一件：卡上的辅助页与编辑页都要这一枚图标，而它是「组件 + 蒙版 + 滤镜」
 * 三样绑在一起的东西（`<img>` 是替换元素，长不出盖纱的伪元素，必须套一层壳）。
 * 原先这一套写在卡的 CSS 里，编辑页要用时只能再抄一遍——两份滤镜迟早漂成两种色。
 *
 * ## 两层处理，缺一不可
 *
 * 游戏图标是深底金纹（剧情那几项还是深蓝底）的方图，直接贴在这张宣纸上，一块块全是
 * "贴纸"，色相也不在这套墨 / 朱 / 赭里。所以：
 *   1. 壳上盖一层纱（`--veil`），压掉对比；
 *   2. 图自身 `sepia` 暖化、降饱和——只盖纱的话，图标仍是"冷色调蒙了层灰"，
 *      纱只降存在感、不改色相；而蓝色在这套暖色纸里永远跳，得靠 sepia 拉进褐调。
 *
 * ## 纱是暗的，不是纸色
 *
 * 亮色用 `--ink-base`（一个不随主题翻的墨）22%：纸白压在深底图标上等于**提亮**，
 * 图标会被洗成灰白，金纹与轮廓都淡掉——那是「褪色照片」。暗色反过来用 18% 的
 * `--paper`：深色纸已经把图标压住了，再叠墨会糊成一团。
 *
 * 22% 是三档对照后取的中间：16% 时金纹仍比纸抢眼，30% 起细节开始糊。
 */
import { computed } from 'vue';
import PressTile from '../../components/PressTile.vue';
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
    <PressTile still class="assist-icon">
        <span v-if="src" class="shot"><img class="img" :src="src" alt="" /></span>
    </PressTile>
</template>

<style scoped>
/* 28 的块、23 的图：比原先卡上那 48 / 40 小一档——换成「一行一项」之后，行高只有 42，
 * 48 的块塞不进去。小归小，`sepia` 与蒙版让它在纸上仍是「拓印」而不是一块彩色贴纸。
 *
 * 块面用 `--well` 掺 `--paper-2`，比纸深一档：与纸同色的块只剩四道棱，
 * 读作「这一格画得比较淡」，而不是「纸上压着一块东西」。
 * `--tile-drop: 0.75`：28px 的块落满档软影会变成「飘着的卡片」。 */
.assist-icon {
    --tile-w: 28px;
    --tile-h: 28px;
    --tile-r: var(--r-2);
    --tile-face: color-mix(in srgb, var(--well) 55%, var(--paper-2));
    --tile-drop: 0.75;
    flex: none;
}
/* 纱的浓度与色分两个变量：要再调就改 `--veil` 一个数，两个主题各自一档
 * （亮 22%、暗 18%）。写死在 `::after` 里的话，调一次要动两条规则。 */
.shot {
    --veil: 22%;
    --veil-color: var(--ink-base);
    position: relative;
    display: block;
    width: 23px;
    height: 23px;
    /* 圆角比块小一档：同值会让图标的直角顶在块的圆角内侧，两圈弧线差半个像素，
     * 看着像没对齐。`overflow` 与它同值，图标才裁得进这圈弧线里。 */
    border-radius: calc(var(--r-2) - 2px);
    overflow: hidden;
}
.shot::after {
    content: '';
    position: absolute;
    inset: 0;
    background-color: color-mix(in srgb, var(--veil-color) var(--veil), transparent);
    pointer-events: none;
}
/* 暗色换的是**两个**值：浓度降到 18%，色换成纸白——深纸上再叠墨会把图案糊成墨团。 */
:global(:root.dark) .shot {
    --veil: 18%;
    --veil-color: var(--paper);
}
.img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    /* `sepia 0.42` 是"拉进褐调"的主力：四成转褐之后，深蓝也会读作旧墨；
     * `saturate 0.72` 收掉卡通色的艳；`contrast 0.95` 只压一点点——压多了图案
     * 边缘就糊，十七个图标会变成十七块色斑。 */
    filter: sepia(0.42) saturate(0.72) contrast(0.95) brightness(1.05);
}
</style>
