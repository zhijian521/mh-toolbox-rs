//! 同一数据目录只允许一个写入进程；文件句柄由系统在退出或崩溃时释放，不靠删除锁文件。
use std::fs::{File, OpenOptions};
use std::io;
use std::os::windows::fs::OpenOptionsExt;
use std::path::Path;

use windows::core::w;
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowW, IsIconic, SetForegroundWindow, ShowWindow, SW_RESTORE, SW_SHOW,
};

pub(crate) fn acquire(base: &Path) -> io::Result<Option<File>> {
    std::fs::create_dir_all(base)?;
    match OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .share_mode(0)
        .open(base.join("app-instance.lock"))
    {
        Ok(file) => Ok(Some(file)),
        // 只把共享冲突当成重复启动，权限、磁盘等错误必须阻止启动并明确报告。
        Err(error) if matches!(error.raw_os_error(), Some(32 | 33)) => Ok(None),
        Err(error) => Err(error),
    }
}

pub(crate) fn focus_existing() {
    // 窗口标题由 create_main_window 固定；仅在同一数据目录已被占用时查找。
    unsafe {
        if let Ok(window) = FindWindowW(None, w!("梦幻养老助手")) {
            let mode = if IsIconic(window).as_bool() {
                SW_RESTORE
            } else {
                SW_SHOW
            };
            let _ = ShowWindow(window, mode);
            let _ = SetForegroundWindow(window);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exclusive_handle_blocks_other_writers_and_stale_file_does_not() {
        let base = std::env::temp_dir().join(format!("mh-instance-{}", std::process::id()));
        let first = acquire(&base).unwrap().expect("首次获得锁");
        assert!(acquire(&base).unwrap().is_none());
        drop(first);
        let next = acquire(&base).unwrap().expect("句柄释放后可重新启动");
        drop(next);
        std::fs::remove_dir_all(base).unwrap();
    }
}
