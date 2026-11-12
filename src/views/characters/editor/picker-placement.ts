export interface PickerBounds {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/** 浮层先选空间较足的一侧，再收窄、限高，保留边缘的焦点环位置。 */
export function pickerPlacement(anchor: PickerBounds, bounds: PickerBounds, naturalHeight: number) {
    const inset = 8;
    const gap = 6;
    const width = Math.max(0, Math.min(372, bounds.right - bounds.left - inset * 2));
    const left = Math.max(bounds.left + inset, Math.min(anchor.left, bounds.right - inset - width));
    const below = Math.max(0, bounds.bottom - inset - anchor.bottom - gap);
    const above = Math.max(0, anchor.top - gap - bounds.top - inset);
    const up = naturalHeight > below && above > below;
    return { left: left - anchor.left, width, maxHeight: up ? above : below, up };
}
