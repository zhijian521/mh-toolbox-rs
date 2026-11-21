/** 小折线只显示本段相对变化，历史柱图保留实际价格刻度。 */
export function sparkLinePoints(values: readonly number[], width: number, height: number): string {
    if (values.length < 2) return '';
    const low = Math.min(...values);
    const high = Math.max(...values);
    const span = high - low;
    const inset = 2;
    const step = (width - inset * 2) / (values.length - 1);
    return values
        .map((value, index) => {
            const x = inset + index * step;
            const y = span ? inset + ((high - value) / span) * (height - inset * 2) : height / 2;
            return x.toFixed(2) + ',' + y.toFixed(2);
        })
        .join(' ');
}
