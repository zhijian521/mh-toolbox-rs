use tauri::{LogicalSize, WebviewWindow, WindowEvent};

#[derive(Debug, PartialEq)]
pub(crate) struct WindowLayout {
    pub width: f64,
    pub height: f64,
    pub min_width: f64,
    pub min_height: f64,
}

/// 工作区已经扣除任务栏；再留出窗口周围的空间。传入逻辑像素，避免重复乘 DPI。
pub(crate) fn layout(work_width: f64, work_height: f64) -> WindowLayout {
    let width = (work_width - 32.0).max(1.0);
    let height = (work_height - 24.0).max(1.0);
    WindowLayout {
        width: width.min(1280.0),
        height: height.min(860.0),
        min_width: width.min(1024.0),
        min_height: height.min(600.0),
    }
}

/// 拖到另一台显示器或改变系统缩放后，同步最小尺寸，并收回超过工作区的窗口。
pub(crate) fn watch_workspace(window: &WebviewWindow) {
    let target = window.clone();
    let previous = std::sync::Mutex::new(None);
    window.on_window_event(move |event| {
        if !matches!(
            event,
            WindowEvent::Moved(_) | WindowEvent::ScaleFactorChanged { .. }
        ) {
            return;
        }
        let Ok(Some(monitor)) = target.current_monitor() else {
            return;
        };
        let area = monitor.work_area();
        let scale = monitor.scale_factor();
        let key = (area.size.width, area.size.height, scale.to_bits());
        let Ok(mut previous) = previous.lock() else {
            return;
        };
        if previous.as_ref() == Some(&key) {
            return;
        }
        *previous = Some(key);
        drop(previous);
        let work = area.size.to_logical::<f64>(scale);
        let limits = layout(work.width, work.height);
        let _ = target.set_min_size(Some(LogicalSize::new(limits.min_width, limits.min_height)));
        if target.is_maximized().unwrap_or(false) || target.is_fullscreen().unwrap_or(false) {
            return;
        }
        if let Ok(size) = target.inner_size() {
            let size = size.to_logical::<f64>(scale);
            let width = size.width.min((work.width - 32.0).max(1.0));
            let height = size.height.min((work.height - 24.0).max(1.0));
            if width < size.width || height < size.height {
                let _ = target.set_size(LogicalSize::new(width, height));
                let _ = target.set_position(tauri::LogicalPosition::new(
                    area.position.x as f64 / scale + (work.width - width) / 2.0,
                    area.position.y as f64 / scale + (work.height - height) / 2.0,
                ));
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roomy_workspace_keeps_default_size() {
        assert_eq!(
            layout(1920.0, 1040.0),
            WindowLayout {
                width: 1280.0,
                height: 860.0,
                min_width: 1024.0,
                min_height: 600.0,
            }
        );
    }

    #[test]
    fn scaled_and_small_workspaces_keep_window_and_minimum_inside() {
        for (width, height, scale) in [
            (1920.0, 1040.0, 1.25),
            (1920.0, 1040.0, 1.5),
            (1366.0, 728.0, 1.5),
        ] {
            let work_width = width / scale;
            let work_height = height / scale;
            let result = layout(work_width, work_height);
            assert!(result.width < work_width && result.height < work_height);
            assert!(result.min_width <= result.width && result.min_height <= result.height);
        }
    }
}
