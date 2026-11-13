/** 以显示单位生成 1、2、5 × 10ⁿ 的整数刻度，范围始终覆盖零和实际数据。 */
export function integerAxis(values: readonly number[], unit = 1) {
    const scale = Number.isFinite(unit) && unit > 0 ? unit : 1;
    const finite = values.filter(Number.isFinite).map((value) => value / scale);
    const min = Math.min(0, ...finite);
    const max = Math.max(0, ...finite);
    const padding = (max - min) * 0.08;
    const lower = min < 0 ? min - padding : 0;
    const upper = max > 0 ? max + padding : 0;
    const target = Math.max(1, (upper - lower) / 3);
    const magnitude = 10 ** Math.floor(Math.log10(target));
    const multiple = [1, 2, 5, 10].find((one) => one * magnitude >= target) ?? 10;
    const step = multiple * magnitude;
    const first = Math.floor(lower / step);
    const last = Math.max(first + 1, Math.ceil(upper / step));
    return {
        min: first * step * scale,
        max: last * step * scale,
        step: step * scale,
        ticks: Array.from(
            { length: last - first + 1 },
            (_, index) => (last - index) * step * scale,
        ),
    };
}
