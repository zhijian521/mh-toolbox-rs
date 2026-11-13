/** 图形与图例共用浅染配方，保留系列原色与主题高光。 */
export function chartColor(color: string): string {
    return `color-mix(in srgb, ${color} 82%, var(--bevel-hi))`;
}
