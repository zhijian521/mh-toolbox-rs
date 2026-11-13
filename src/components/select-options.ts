export interface SelectOption {
    value: string;
    label: string;
}

/** SelectField 将空串视为未选，筛选的「全部」使用独立值。 */
export const ALL_OPTIONS = '__all__';

/** 旧值不在标准名录时保留在原选项前，避免打开下拉就丢掉已有记录。 */
export function withCurrentOption(options: SelectOption[], current: string): SelectOption[] {
    return current && !options.some((item) => item.value === current)
        ? [{ value: current, label: current }, ...options]
        : options;
}
