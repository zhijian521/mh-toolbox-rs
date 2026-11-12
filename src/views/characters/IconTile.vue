<script setup lang="ts">
/**
 * 一枚「压印块 + 过了纸化的游戏图标」：辅助技能、门派技能、装备格共用。
 *
 * 为什么单独一件：2026-11-03 它先在 `AssistIcon` 里成型（当时只有辅助用），
 * 2026-11-04 门派技能也从首字印换成真图标——**同一套处理再抄一遍，两批图迟早漂成两种色**，
 * 于是把材质提到这里，两个业务组件只负责「查哪张图」。
 *
 * ## 只剩一层：图自身的滤镜
 *
 * 游戏图标是深底金纹（剧情那几项还是深蓝底）的方图，色相不在这套墨 / 朱 / 赭里，
 * 所以要 `sepia` 暖化、降饱和，把蓝色拉进褐调。
 *
 * **原先还盖一层压暗的纱，2026-11-04 撤掉了**（用户：「我们用到的游戏的图标不加遮罩层了」）。
 * 那层纱的判据是「压掉对照、降存在感」，代价是**认不出画的是什么**——十几个图标都变成
 * 同一块暗斑，而这一栏恰恰要靠图案区分（太极 / 符 / 仙鹤 / 剑 / 星图）。撤掉之后
 * 图形与金纹都回到可辨，**暖化仍由滤镜一层完成**，色相照样在纸的调子里。
 * 别再补回来：真要压，改 `--tile-face` 或滤镜的 `brightness`，不要再加一层。
 *
 * ## 几何走变量
 *
 *   - `--tile-w` / `--tile-h` 块的大小（默认 28）
 *   - `--shot`                图的大小（默认 23）
 *
 * 与 `PressTile` 的其余变量同一条约定：组件说材质与内部排布，尺寸归调用方。
 * 辅助那行 42 高、师门那行 40、装备格 109，三处各给一套——比值不同，不必共用一个数。
 *
 * `still` 是必需的：这三处都不是按钮，块上的悬停与按下是「按我」的承诺，
 * 长在点不动的地方等于骗人去点（装备格整格可点，但可点的是**格子**——它自己会
 * 转朱与加深边，块不参与）。
 *
 * **没有图时不在这里兜底**：师门与装备格都是「`IconTile` 与一块首字压印块二选一」
 * （见 `SkillRow` 与 `CharacterCard`）。不把首字塞进插槽，是因为那一块的块面与字色
 * 是**业务语义**（师门用朱，标记「这枚是替身」；装备格用淡墨，标记「这类图还没切」），
 * 而 `IconTile` 只管材质。
 */
import { ref, watch } from 'vue';
import PressTile from '../../components/PressTile.vue';

const props = defineProps<{
    /** 图地址。没有就只画一块空块——老存档里手敲的名字、游戏新加的技能都会走到这里。 */
    src?: string;
}>();
const failed = ref(false);
watch(
    () => props.src,
    () => {
        failed.value = false;
    },
    { flush: 'sync' },
);
</script>

<template>
    <PressTile still class="icon-tile">
        <span v-if="src && !failed" class="shot">
            <img class="img" :src="src" alt="" loading="lazy" @error="failed = true" />
        </span>
    </PressTile>
</template>

<style scoped>
/* 块面用 `--well` 掺 `--paper-2`，比纸深一档：与纸同色的块只剩四道棱，
 * 读作「这一格画得比较淡」，而不是「纸上压着一块东西」。
 * `--tile-drop: 0.75`：28px 的块落满档软影会变成「飘着的卡片」。 */
.icon-tile {
    --tile-w: 28px;
    --tile-h: 28px;
    --tile-r: var(--r-2);
    --tile-face: color-mix(in srgb, var(--well) 55%, var(--paper-2));
    --tile-drop: 0.75;
    flex: none;
}
/* 壳只剩「圈出这一格 + 裁圆角」两件事。原先这里还挂一层 `::after` 的纱（亮 22% 墨 /
 * 暗 18% 纸），2026-11-04 撤掉——见文件头。`<img>` 是替换元素，本身长不出伪元素，
 * 所以这块壳仍然留着：圆角与外框得有一个不是 `<img>` 的盒子来给。 */
.shot {
    position: relative;
    display: block;
    width: var(--shot, 23px);
    height: var(--shot, 23px);
    /* 圆角比块小一档：同值会让图标的直角顶在块的圆角内侧，两圈弧线差半个像素，
     * 看着像没对齐。`overflow` 与它同值，图标才裁得进这圈弧线里。 */
    border-radius: calc(var(--r-2) - 2px);
    overflow: hidden;
}
.img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    /* `sepia 0.42` 是"拉进褐调"的主力：四成转褐之后，深蓝也会读作旧墨；
     * `saturate 0.72` 收掉卡通色的艳；`contrast 0.95` 只压一点点——压多了图案
     * 边缘就糊，十几个图标会变成十几块色斑。
     *
     * `brightness(1.05)` 是原有的一档，撤纱后仍留：深底图标压在深一档的块面上，
     * 不提一点会显得比旁边的字闷。 */
    filter: var(--skill-icon-filter);
}
</style>
