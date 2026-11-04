<script setup lang="ts">
import LedgerSection from '../../components/LedgerSection.vue';
import NumTag from '../../components/NumTag.vue';
import AssistIcon from '../characters/AssistIcon.vue';

/**
 * 辅助小票：辅助技能那一页的**一项**——图标 ｜ 名字 ｜ 数值签。
 *
 * 它不是原子卡里的东西：票面由四道棱与一层落影拼出来，里面又塞了 `AssistIcon`
 * 与 `NumTag` 两个件，还带着业务语义（`level` / `cap` / `off`）。所以按
 * CONVENTIONS §2.3-4 另开一张卡。
 *
 * ## 这张卡要盯的是「三种状态 + 一个缺省」
 *
 *   - 满级：数字转朱（`assist-val.max`）
 *   - 练到一半 / 0 级：都是赭，差别在数字
 *   - 未学：块与字一起退（`.off`），但仍占位
 *   - 名字不在名录里：**空块，不留破图**（`AssistIcon` 的 `src` 为空时不渲染 `<img>`）
 *
 * ## 尺寸
 *
 * 票宽 198 是卡上真身的实际值：卡 450 − 左右各 20（`--card-pad-x`）− 滚动条占位 2
 * = 408，两列 gap 12 → 每列 198。票高不在这里定：
 * 材质在 `base.css` 的 `.assist-slip`，高度由使用方给——卡上 42、编辑页 38。
 * 这一格钉 42，照卡上那一态。
 */
const DEMO = [
    { name: '强身术', kind: 'life' as const, level: 100, max: true },
    { name: '打造技巧', kind: 'life' as const, level: 56, max: false },
    { name: '冥想', kind: 'life' as const, level: 0, max: false },
    { name: '调息', kind: 'story' as const, level: 5, max: false, off: true },
];
</script>

<template>
    <LedgerSection title="辅助小票" hint="图标 ｜ 名字 ｜ 数值签，一项一行">
        <div class="slips-kit">
            <div v-for="row in DEMO" :key="row.name" class="assist-slip" :class="{ off: row.off }">
                <AssistIcon :name="row.name" :kind="row.kind" />
                <span class="assist-name">{{ row.name }}</span>
                <NumTag class="assist-val" :class="{ max: row.max }">
                    <span class="lv">{{ row.level }}</span>
                </NumTag>
            </div>
            <div class="assist-slip">
                <AssistIcon name="查无此技" kind="life" />
                <span class="assist-name">查无此技</span>
                <NumTag class="assist-val"><span class="lv">0</span></NumTag>
            </div>
        </div>

        <p class="note">
            票面与三列在 <code>base.css</code> 的 <code>.assist-slip</code> 一族，卡与编辑页共用；
            高度由使用方给（卡 42 / 弹窗 38）。
        </p>
        <p class="note">
            <b>未学</b>（第四张）只压块与字、仍占位——少一项会让人以为漏记了。最后一张名字不在
            名录里：不画图，留一块空块，不挂破图。
        </p>
    </LedgerSection>
</template>

<style scoped>
/* 198 是卡上真身的宽度（450 − 左右各 20 − 滚动条占位 2 = 408，两列 gap 12）。
 * 这里按真身给，否则「开发页好看、卡上截断」又要多查一轮。 */
.slips-kit {
    display: grid;
    grid-template-columns: repeat(2, 198px);
    max-width: 100%;
    gap: 6px 12px;
}
/* 高度不在 `base.css` 里：那里只给材质，几何由使用方定（同 `.num-slot`）。 */
.slips-kit .assist-slip {
    height: 42px;
}
</style>
