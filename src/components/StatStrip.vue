<script lang="ts">
/**
 * 统计条里的一个数字。
 *
 * 类型放在普通 `<script>` 块里而不是 `<script setup>`：后者不能 `export`
 * （它在编译后是 `setup()` 的函数体），而调用方需要这个类型来拼数组。
 */
export interface StatItem {
    /** 名目（「收入」「笔数」）。 */
    cap: string;
    /**
     * 已经格式化好的读数（`462.5 万` / `−1.2 万` / `3`）。
     * 格式化不在这里做：单位和符号的口径属于业务（`amountText` / `signedOf`），组件只负责摆。
     */
    value: string;
    /**
     * 读数色。三档各有方向：
     *   - `gain` 苔绿：进账（收入、为正的净额）；
     *   - `loss` 朱红：出账（支出、为负的净额）；
     *   - `num` 赭：不带方向的数（笔数、支出为 0 时的「—」）。
     *
     * 2026-11-11 用户：「统计上的数字字体颜色优化一下，一般收益为绿色，花费为红色」。
     * 用的是现有的 `--moss` / `--cinnabar`，不新造色号——它们本来就管「好」与「坏」。
     */
    tone?: 'num' | 'gain' | 'loss';
    /**
     * 副文左段：这一格由什么组成（「31 笔 · 均 14.9 万」「结余率 97.3%」「4 个号」）。
     *
     * **由调用方给字符串**，组件不认识「笔均」也不认识「结余率」：这两个口径住在
     * `income.ts`，收益页与总览页共用同一份（`statRowsOf`）。放到组件里算，
     * 两页就会各长一套，而它们显示的是同一组数。
     */
    sub?: string;
    /** 副文右段：较上一档的增减，已带符号（`+12.4%` / `±0 笔` / `—`）。 */
    delta?: string;
}
</script>

<script setup lang="ts">
import PaperCard from './PaperCard.vue';

/**
 * 统计条：一排四张纸。
 *
 * ---- 材质为什么从「四枚压印签」换成「四张纸」 ----
 * 2026-11-05 这里从「一行账」改成四枚 `PressTile` 压印签（用户当时说「参考下物价卡片」，
 * 借的是那块凸起纸块的厚度）。2026-11-11 用户再看这一屏：「四个统计卡片和下面的卡片
 * 样式保持一致吧，看起来整齐」——同一页里统计条是凸起的小块、下面两张是台面上的纸，
 * 两种厚度并排，读起来像「上半页和下半页不是一套」。
 *
 * 现在四格都用 `PaperCard`（`.board`），与 `LedgerSection` 包着的速记两栏**同一层材质**：
 * 一张纸的圆角、上亮下暗的棱、下沿 3px 断面、硬影加软影，一处都不重写。间距也给到 16，
 * 与 `.income-stack` / `.split` 同一个数——纸的软影会探出卡外，10 的时候邻卡的影子
 * 压在下一张的边角上，读作「四张糊在一起」。
 *
 * ---- 为什么每格还留一行副文 ----
 * 只有「名目 + 读数」时，一格只回答「多少」，不回答「由什么组成」。用户嫌薄。
 * 现在副文那行是**两端**：左端说构成（几笔、笔均、占收入、结余率、几个号），
 * 右端说较上一档的增减。两者都是 10px 灰字，读数仍是唯一的主角。
 *
 * 副文**不上色**：四格的「好」方向不一样（收入涨是好事、支出涨不是），
 * 同一个苔/朱压在四个方向上会读出错的意思，方向交给 `+/−`。
 *
 * ---- 列数不写死 ----
 * 由 `items.length` 决定（`--stat-n`）：这一块以后可能要摆 3 格或 5 格。
 */
withDefaults(defineProps<{ items: StatItem[] }>(), {});
</script>

<template>
    <section class="stats" :style="{ '--stat-n': items.length }">
        <!-- 每格就是一张纸，不是「纸 + 内容层」两层：材质与下面两张速记卡完全同源，
             内容直接排在这张纸的内边距里。 -->
        <PaperCard v-for="item in items" :key="item.cap" as="div" class="stat">
            <div class="cap">{{ item.cap }}</div>
            <!-- 品名与读数之间那道虚线，与物价卡同一个说法：上半写名目、下半写数目。 -->
            <span class="dash" aria-hidden="true" />
            <div class="v" :class="item.tone ?? 'num'">{{ item.value }}</div>
            <div v-if="item.sub || item.delta" class="subrow">
                <span class="sub">{{ item.sub }}</span>
                <span class="delta">{{ item.delta }}</span>
            </div>
        </PaperCard>
    </section>
</template>

<style scoped>
/* 四块之间 16：与 `.income-stack` / `.split` 同一个数。纸有 10px 的软影探出卡外，
 * 10 的间距会让邻卡的影压在这张的边角上，四张读作「糊在一起」。 */
.stats {
    display: grid;
    grid-template-columns: repeat(var(--stat-n, 4), minmax(0, 1fr));
    gap: 16px;
}

/* 每格是一张 `.board`（PaperCard 的根）。这里只覆盖内边距：`.board` 通用的 20 是给
 * 整块内容页的，统计签只有四行小字，20 会把格子撑得又高又空。
 *
 * 选择器特异性与 `.board` 同为 0-1-0，靠注入顺序（组件 scoped 在全局 base.css 之后）
 * 生效——`LedgerSection` 的 `--block-pad` 走的也是这条路。 */
.stat {
    display: flex;
    flex-direction: column;
    min-width: 0;
    /* 高度不写死：字号有 1.0 / 1.1 两档，写死会把副文挤到纸外面。88 只是下限，
     * 让四张卡在「一格内容很少」时也与原来的高度一致，不会缩成四片薄条。 */
    min-height: 88px;
    padding: 9px 13px 10px;
}

.cap {
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.08em;
}

.dash {
    display: block;
    margin: 5px 0 4px;
    border-top: 1px dashed var(--rule-2);
}

/* `--fs-amount` 是账面读数那一档字号：这四个数是这一块的主语，不能与正文同号。
 * 窄的时候省略号而不是换行——换行会把四格的高度撑得不一样高。 */
.v {
    overflow: hidden;
    font-size: var(--fs-amount);
    line-height: 1.3;
    white-space: nowrap;
    text-overflow: ellipsis;
}
/* 三档色（2026-11-11 用户「一般收益为绿色，花费为红色」）。
 * 用现成的 `--moss` / `--cinnabar`，它们本来就在亮暗两套里各翻过一次面，不必新调色号。 */
.num {
    color: var(--num);
}
.gain {
    color: var(--moss);
}
/* 支出与净额为负时转朱：与卡上的三层（墨名目 / 赭读数 / 朱强调）同一条。 */
.loss {
    color: var(--cinnabar);
}

/* 副文行两端对齐：左段吃满剩余宽度（放不下就省略号），右段永不让位。
 * 右段是「较上一档」，它比左段短得多，挤掉它等于把结论丢了。 */
.subrow {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-top: auto;
    padding-top: 4px;
}
.sub {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    font-size: var(--fs-mini);
    line-height: 1.5;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.delta {
    flex: none;
    color: var(--muted);
    font-size: var(--fs-mini);
    line-height: 1.5;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
</style>
