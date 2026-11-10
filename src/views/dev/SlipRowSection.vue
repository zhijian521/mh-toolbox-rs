<script setup lang="ts">
import LedgerSection from '../../components/LedgerSection.vue';
import NumTag from '../../components/NumTag.vue';
import AssistIcon from '../characters/AssistIcon.vue';

/**
 * 票面行：属性 / 师门 / 辅助 / 修炼四页共用的**一行**——图标（可省）｜ 名字 ｜ 读数签。
 *
 * 这不是原子卡里的东西：票面由四道棱与一层落影拼出来，里面又塞了 `AssistIcon` 与
 * `NumTag` 两个件，还带业务语义（等级、满级、未学）。所以按 CONVENTIONS §2.3-4
 * 另开一张卡。
 *
 * ## 这张卡要盯的是「两档 + 两种形态」
 *
 *   - **md（42）**：师门 / 辅助 / 修炼。装一块 28 见方的压印块，块上下各留 7。
 *   - **sm（28）**：属性。没有图标，一行只有一个数；票、圆角、落影一起收小。
 *   - **有没有图标**：两档都合法。修炼十项本来就没有图可给，行首那一格让给名目。
 *
 * 状态三种：满级（数转朱）／ 0 级（名与数退灰）／ 未学（连签一起淡，仍占位）。
 * 还有一条缺省：名字不在名录里时**空块，不留破图**（`AssistIcon` 的 `src` 为空
 * 时不渲染 `<img>`）。
 *
 * ## 尺寸照真身
 *
 * md 宽 183 是卡上的实际值：卡 420 − 左右各 20（`--card-pad-x`）− 滚动条占位 2
 * = 378，两列 gap 12 → 每列 183。sm 宽 177 是属性页两列的实际值（380 − 26 列距再
 * 除以 2）。开发页按真身给，否则「这里好看、卡上截断」又要多查一轮。
 */
const WITH_ICON = [
    { name: '强身术', kind: 'life' as const, level: '100', full: true },
    { name: '打造技巧', kind: 'life' as const, level: '56' },
    { name: '冥想', kind: 'life' as const, level: '0', idle: true },
    { name: '调息', kind: 'story' as const, level: '5', off: true },
    { name: '查无此技', kind: 'life' as const, level: '0' },
];
const PLAIN = [
    { name: '攻击修炼', level: '20', full: true },
    { name: '防御控制力', level: '18' },
];
const SMALL = [
    { name: '气血', level: '3916' },
    { name: '法防', level: '0', idle: true },
];
</script>

<template>
    <LedgerSection title="票面行" hint="四页共用：图标（可省）｜ 名字 ｜ 读数签" max-height="60vh">
        <!-- md 档、带图标：师门与辅助就是这一态 -->
        <div class="slip-kit">
            <div
                v-for="row in WITH_ICON"
                :key="row.name"
                class="slip-row"
                :class="{ full: row.full, idle: row.idle, off: row.off }"
            >
                <AssistIcon :name="row.name" :kind="row.kind" />
                <span class="slip-name">{{ row.name }}</span>
                <NumTag class="slip-val"
                    ><span class="lv">{{ row.level }}</span></NumTag
                >
            </div>
        </div>
        <p class="note">
            <b>md 档 42</b>：图标 28 ｜ 名字 ｜ 签 56×24。第四张是<b>未学</b>（连签一起淡、
            仍占位），第五张名字不在名录里——不画图、留一块空块，不挂破图。
        </p>

        <!-- md 档、不给图标：修炼就是这一态 -->
        <div class="slip-kit">
            <div v-for="row in PLAIN" :key="row.name" class="slip-row" :class="{ full: row.full }">
                <span class="slip-name">{{ row.name }}</span>
                <NumTag class="slip-val"
                    ><span class="lv">{{ row.level }}</span></NumTag
                >
            </div>
        </div>
        <p class="note">
            <b>不给图标是合法形态</b>，不是降级。行首那一格并进左侧内边距，名目从 8 起排
            ——修炼十项本来就没有图可给。
        </p>

        <!-- sm 档：属性那一页 -->
        <div class="slip-kit sm">
            <div
                v-for="row in SMALL"
                :key="row.name"
                class="slip-row sm"
                :class="{ idle: row.idle }"
            >
                <span class="slip-name">{{ row.name }}</span>
                <NumTag class="slip-val"
                    ><span class="lv">{{ row.level }}</span></NumTag
                >
            </div>
        </div>
        <p class="note">
            <b>sm 档 28</b>：签收到 52×18，圆角与落影一起小一档。属性页 11 个视觉行要装进 493
            的版心，只有这一档装得下。
        </p>
    </LedgerSection>
</template>

<style scoped>
/* 按真身给宽：md 183（卡上两列），sm 177（属性页两列）。高度不在这里定——
 * 材质与两档尺寸都在 `base.css` 的 `.slip-row`，这里只给「演示怎么排」。 */
.slip-kit {
    display: grid;
    grid-template-columns: repeat(2, 183px);
    max-width: 100%;
    gap: 6px 12px;
    margin-bottom: 6px;
}
.slip-kit.sm {
    grid-template-columns: repeat(2, 177px);
    gap: 2px 26px;
}
</style>
