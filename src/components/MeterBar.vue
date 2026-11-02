<script setup lang="ts">
/**
 * 进度条：一条凹槽，里面灌一段朱色。
 *
 * 与 `SteppedSlider` 是同一套凹槽语言，但**不是滑块**——它没有落点、不能拖、
 * 不表示「选了哪一个」，只表示「走到了多少」。两件事共用一个外观会让人去拖它。
 *
 * `percent` 允许 `null`（不知道分母）：那时轨道空着，且**不写 `aria-valuenow`**——
 * 有 `aria-valuenow` 就是「确定值 0%」的意思，而空轨道说的是「还没填」。
 * 这个区别在经验那一行是实打实的：新角色还没填「升级所需」，条不该读成「练了 0%」。
 *
 * 填充不挂 `.stamp`：印面那套是给 23px 以上的块调的（外投影 + 9px 受光带），
 * 压在 10–14px 的条上只剩一圈毛边。这里只要一段朱色 + 一道顶部内高光。
 *
 * **高度走 `--meter-h`**（§2.3-15：尺寸只有一个入口，组件不认 prop）：默认 10px，
 * 嵌在行内时够用；卡上经验那一条独占一行、要当读数看，父级给 14px。
 */
withDefaults(
    defineProps<{
        /** 0–100；`null` 表示分母未知，轨道空着。 */
        percent: number | null;
        /** 读屏念的名字（「经验」）。 */
        label: string;
        /** 右侧的数值文本，如 `3,777.2万 / 4,200万`。不给就只显示条。 */
        text?: string;
    }>(),
    { text: '' },
);
</script>

<template>
    <div
        class="meter"
        role="progressbar"
        :aria-label="label"
        :aria-valuenow="percent === null ? undefined : Math.round(percent)"
        aria-valuemin="0"
        aria-valuemax="100"
    >
        <span class="meter-track well">
            <i class="meter-fill" :style="{ width: `${percent ?? 0}%` }" />
        </span>
        <span v-if="text" class="meter-text num">{{ text }}</span>
    </div>
</template>

<style scoped>
.meter {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}
/* 默认 10 是「看得出是一条槽、又不至于抢走一行数据」的折中：6px 时槽底的内影
 * 糊成一条灰线，而 14 以上放在一行正文里就比文字还重。所以 14 只给「独占一行的读数」
 * 用（经验条），由父级覆写 `--meter-h`，这里不给 prop。 */
.meter-track {
    position: relative;
    flex: 1;
    height: var(--meter-h, 10px);
    min-width: 40px;
    padding: 2px;
    border-radius: var(--r-pill);
    overflow: hidden;
}
.meter-fill {
    display: block;
    height: 100%;
    border-radius: var(--r-pill);
    background-color: var(--seal);
    background-image: linear-gradient(
        180deg,
        color-mix(in srgb, var(--bevel-hi) 26%, transparent),
        transparent 60%
    );
    /* 只在「值变了」时过渡宽度：初次渲染从 0 长出来会像加载动画。 */
    transition: width var(--t-thumb) var(--ease-soft);
}
.meter-text {
    flex: none;
    color: var(--ink-2);
    font-size: var(--fs-sm);
    white-space: nowrap;
}
</style>
