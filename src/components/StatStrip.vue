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
    /** 读数色：赭（金额）、朱（负值与支出）。默认赭——笔数这类不带方向的数也是赭。 */
    tone?: 'num' | 'loss';
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
import PressTile from './PressTile.vue';

/**
 * 统计条：四枚压印签。
 *
 * ---- 为什么从「一行账」改成四张卡 ----
 * 2026-11-05 之前这里是一圈文武线里排四个数：结构与物价卡同源，但少了那层纸的厚度，
 * 四格数被压在纸面上，与下方两张速记卡是同一种线，读不出主次。
 * 用户的原话是「不好看，可以参考下物价卡片」，参考的正是物价卡那块**压印的纸**。
 *
 * 改成四块之后，材质直接借 `PressTile`（三层光 + 四条不对称棱 + 硬影加软影），
 * 这里一份配方都不重写——物价卡与统计签是同一块纸的两种尺寸，抄第二遍就会走样。
 * 传 `wide`：那块 56px 图标格的偏光摊到 265 宽的签上会铺掉半张纸（见 `PressTile` 的注释）。
 *
 * ---- 为什么每格多了一行副文 ----
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
        <div v-for="item in items" :key="item.cap" class="stat">
            <!-- 材质在背景层，内容在它上面。
                 早先把内容塞进 `PressTile` 的默认插槽，会被它那句 `place-items: center`
                 按住——四格的内容必须各自顶对齐，不能被材质居中。 -->
            <PressTile still wide class="stat-surface" aria-hidden="true" />
            <div class="stat-body">
                <div class="cap">{{ item.cap }}</div>
                <!-- 品名与读数之间那道虚线，与物价卡同一个说法：上半写名目、下半写数目。 -->
                <span class="dash" aria-hidden="true" />
                <div class="v" :class="item.tone ?? 'num'">{{ item.value }}</div>
                <div v-if="item.sub || item.delta" class="subrow">
                    <span class="sub">{{ item.sub }}</span>
                    <span class="delta">{{ item.delta }}</span>
                </div>
            </div>
        </div>
    </section>
</template>

<style scoped>
/* 四块之间 10：比正文行距紧一档，读作「一排」而不是「四张卡散着」。
 * 宽度上限交给调用方的栅格，这里只负责等分。 */
.stats {
    display: grid;
    grid-template-columns: repeat(var(--stat-n, 4), minmax(0, 1fr));
    gap: 10px;
}

/* 卡片本体只是一个定位容器：材质在背景层，内容在上面。 */
.stat {
    position: relative;
    display: flex;
    min-width: 0;
}

/* 铺满整块。尺寸走 `--tile-w` / `--tile-h` 而不是直接写 width / height：
 * `PressTile` 内部写着 `width: var(--tile-w, auto)`，与本类落在同一个元素上，
 * 两边特异性一样，直接写会回到「谁先注入谁赢」的坑（物价卡为此踩过一次）。 */
.stat-surface {
    position: absolute;
    inset: 0;
    --tile-w: 100%;
    --tile-h: 100%;
    /* 落地影收一档：默认是按 56px 图标格调的，同样 8px 的软影摊在 265 × 88 的签上会散开。 */
    --tile-drop: 0.9;
}

/* 内容层。`min-height` 不是写死高度：字号有 1.0 / 1.1 两档，写死会把副文挤出卡外，
 * 而卡面边框与落影还停在原高度，看起来像贴纸被撕开。 */
.stat-body {
    position: relative;
    z-index: 1;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
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
.num {
    color: var(--num);
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
    margin-top: 4px;
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
