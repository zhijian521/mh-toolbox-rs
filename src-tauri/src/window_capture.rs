//! 捕获指定游戏窗口本身，避免屏幕 DC 把遮挡物当成游戏消息。

use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};
use windows::Foundation::TypedEventHandler;

use windows::core::Interface;
use windows::Graphics::Capture::{
    Direct3D11CaptureFrame, Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession,
};
use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Win32::Foundation::{HMODULE, HWND};
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::System::WinRT::Direct3D11::{
    CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess,
};
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED};
use windows::Win32::UI::WindowsAndMessaging::{IsIconic, IsWindow};

use crate::screen::Frame;

// COM 对象必须比线程 apartment 先释放。
struct Apartment;
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}

/// 放大窗口后旧帧池可能仍返回小纹理，不能裁成旧尺寸冒充完整新画面。
fn frame_dimensions(
    width: i32,
    height: i32,
    texture_width: u32,
    texture_height: u32,
) -> windows::core::Result<(u32, u32)> {
    if width <= 0 || height <= 0 || width as u32 > texture_width || height as u32 > texture_height {
        return Err(windows::core::Error::new(
            windows::core::HRESULT(0x80070057u32 as i32),
            "游戏窗口尺寸已变化，请停止后重新开始监听",
        ));
    }
    Ok((width as u32, height as u32))
}

// 回调仅接收 GPU 帧。OCR 忙时替换旧帧，只有消费者才把最终选中的纹理复制到 CPU。
#[derive(Default)]
struct LatestFrame {
    frame: Mutex<Option<(Instant, Direct3D11CaptureFrame)>>,
    ready: Condvar,
}

pub struct WindowCapture {
    latest: Arc<LatestFrame>,
    arrived_token: i64,
    hwnd: HWND,
    pool: Direct3D11CaptureFramePool,
    session: GraphicsCaptureSession,
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    _apartment: Apartment,
}

impl WindowCapture {
    pub fn open(handle: i64) -> Result<Self, String> {
        Self::create(handle).map_err(|error| format!("窗口捕获不可用：{error}"))
    }

    fn create(handle: i64) -> windows::core::Result<Self> {
        unsafe { RoInitialize(RO_INIT_MULTITHREADED)? };
        let apartment = Apartment;
        let hwnd = HWND(handle as *mut std::ffi::c_void);
        let interop: IGraphicsCaptureItemInterop =
            windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()?;
        let item: GraphicsCaptureItem = unsafe { interop.CreateForWindow(hwnd)? };
        let mut device = None;
        let mut context = None;
        unsafe {
            D3D11CreateDevice(
                None,
                D3D_DRIVER_TYPE_HARDWARE,
                HMODULE::default(),
                D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                None,
                D3D11_SDK_VERSION,
                Some(&mut device),
                None,
                Some(&mut context),
            )?;
        }
        let device = device.ok_or_else(windows::core::Error::from_thread)?;
        let context = context.ok_or_else(windows::core::Error::from_thread)?;
        let dxgi: IDXGIDevice = device.cast()?;
        let runtime: IDirect3DDevice =
            unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi)? }.cast()?;
        let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
            &runtime,
            DirectXPixelFormat::B8G8R8A8UIntNormalized,
            2,
            item.Size()?,
        )?;
        let session = pool.CreateCaptureSession(&item)?;
        session.SetIsCursorCaptureEnabled(false)?;
        let latest = Arc::new(LatestFrame::default());
        let slot = latest.clone();
        let arrived_token = pool.FrameArrived(&TypedEventHandler::<
            Direct3D11CaptureFramePool,
            windows::core::IInspectable,
        >::new(move |sender, _| {
            if let Some(frame) = sender.as_ref().and_then(|pool| pool.TryGetNextFrame().ok()) {
                let mut pending = slot.frame.lock().unwrap_or_else(|e| e.into_inner());
                if let Some((_, old)) = pending.replace((Instant::now(), frame)) {
                    let _ = old.Close();
                }
                slot.ready.notify_one();
            }
            Ok(())
        }))?;
        session.StartCapture()?;
        Ok(Self {
            latest,
            arrived_token,
            hwnd,
            pool,
            session,
            device,
            context,
            _apartment: apartment,
        })
    }

    pub fn frame(&self) -> Result<Frame, String> {
        self.next_frame()?
            .map(|(_, frame)| frame)
            .ok_or_else(|| "等待游戏画面超时".into())
    }

    pub fn next_frame(&self) -> Result<Option<(Instant, Frame)>, String> {
        if !unsafe { IsWindow(Some(self.hwnd)) }.as_bool() {
            return Err("游戏窗口已关闭，请重新选择".into());
        }
        if unsafe { IsIconic(self.hwnd) }.as_bool() {
            return Err("游戏已最小化，暂停读取；还原后自动继续".into());
        }
        let pending = self.latest.frame.lock().unwrap_or_else(|e| e.into_inner());
        let (mut pending, _) = self
            .latest
            .ready
            .wait_timeout_while(pending, Duration::from_millis(1200), |frame| {
                frame.is_none()
            })
            .unwrap_or_else(|e| e.into_inner());
        let frame = pending.take();
        drop(pending);
        frame
            .map(|(arrived, captured)| {
                self.read_frame(captured)
                    .map(|frame| (arrived, frame))
                    .map_err(|error| format!("未读到新的游戏画面：{error}"))
            })
            .transpose()
    }

    fn read_frame(&self, captured: Direct3D11CaptureFrame) -> windows::core::Result<Frame> {
        let size = captured.ContentSize()?;
        let access: IDirect3DDxgiInterfaceAccess = captured.Surface()?.cast()?;
        let texture: ID3D11Texture2D = unsafe { access.GetInterface()? };
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        unsafe { texture.GetDesc(&mut desc) };
        let (width, height) = frame_dimensions(size.Width, size.Height, desc.Width, desc.Height)?;
        desc.Usage = D3D11_USAGE_STAGING;
        desc.BindFlags = 0;
        desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
        desc.MiscFlags = 0;
        let mut staging = None;
        unsafe {
            self.device
                .CreateTexture2D(&desc, None, Some(&mut staging))?
        };
        let staging = staging.ok_or_else(windows::core::Error::from_thread)?;
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        unsafe {
            self.context.CopyResource(&staging, &texture);
            self.context
                .Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))?;
        }
        let mut bgra = Vec::with_capacity((width * height * 4) as usize);
        for y in 0..height as usize {
            let row = unsafe {
                std::slice::from_raw_parts(
                    mapped.pData.cast::<u8>().add(y * mapped.RowPitch as usize),
                    width as usize * 4,
                )
            };
            bgra.extend_from_slice(row);
        }
        unsafe { self.context.Unmap(&staging, 0) };
        captured.Close()?;
        Ok(Frame {
            width,
            height,
            bgra,
        })
    }
}

impl Drop for WindowCapture {
    fn drop(&mut self) {
        let _ = self.pool.RemoveFrameArrived(self.arrived_token);
        let _ = self.session.Close();
        let _ = self.pool.Close();
    }
}

/// 浏览器直接显示无损 BMP；像素仅用于区域校准，不写磁盘。
pub fn image_url(frame: &Frame) -> String {
    use base64::Engine;
    let size = frame.bgra.len() as u32 + 54;
    let mut bmp = Vec::with_capacity(size as usize);
    bmp.extend_from_slice(b"BM");
    bmp.extend_from_slice(&size.to_le_bytes());
    bmp.extend_from_slice(&[0; 4]);
    bmp.extend_from_slice(&54u32.to_le_bytes());
    bmp.extend_from_slice(&40u32.to_le_bytes());
    bmp.extend_from_slice(&(frame.width as i32).to_le_bytes());
    bmp.extend_from_slice(&(-(frame.height as i32)).to_le_bytes());
    bmp.extend_from_slice(&1u16.to_le_bytes());
    bmp.extend_from_slice(&32u16.to_le_bytes());
    bmp.extend_from_slice(&[0; 24]);
    bmp.extend_from_slice(&frame.bgra);
    format!(
        "data:image/bmp;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bmp)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enlarged_content_cannot_be_reported_as_the_old_texture_size() {
        assert_eq!(frame_dimensions(800, 600, 800, 600).unwrap(), (800, 600));
        assert_eq!(frame_dimensions(640, 480, 800, 600).unwrap(), (640, 480));
        assert!(frame_dimensions(900, 600, 800, 600).is_err());
        assert!(frame_dimensions(800, 700, 800, 600).is_err());
        assert!(frame_dimensions(0, 600, 800, 600).is_err());
        assert!(frame_dimensions(800, -1, 800, 600).is_err());
    }
}
