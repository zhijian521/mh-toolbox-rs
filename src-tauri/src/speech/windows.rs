use super::Job;
use std::sync::atomic::Ordering;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::time::{Duration, Instant};
use windows::core::{Error, Result as WinResult, HSTRING};
use windows::Foundation::TypedEventHandler;
use windows::Media::Core::MediaSource;
use windows::Media::Playback::MediaPlayer;
use windows::Media::SpeechSynthesis::{SpeechSynthesizer, VoiceInformation};
use windows::Win32::Foundation::E_FAIL;
use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED};

struct Apartment;

impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}

fn voice_rank(language: &str, name: &str) -> Option<u8> {
    if language.eq_ignore_ascii_case("zh-CN") {
        return Some(if name.to_ascii_lowercase().contains("yaoyao") {
            0
        } else {
            1
        });
    }
    language
        .to_ascii_lowercase()
        .starts_with("zh-")
        .then_some(2)
}

fn chinese_voice() -> WinResult<Option<VoiceInformation>> {
    let voices = SpeechSynthesizer::AllVoices()?;
    let mut best = None;
    let mut best_rank = u8::MAX;
    for index in 0..voices.Size()? {
        let voice = voices.GetAt(index)?;
        let Some(rank) = voice_rank(
            &voice.Language()?.to_string(),
            &voice.DisplayName()?.to_string(),
        ) else {
            continue;
        };
        if rank < best_rank {
            best = Some(voice);
            best_rank = rank;
            if rank == 0 {
                break;
            }
        }
    }
    Ok(best)
}

pub(super) fn play(job: &Job) -> Result<(), String> {
    unsafe { RoInitialize(RO_INIT_MULTITHREADED) }
        .map_err(|e| format!("无法初始化系统语音：{e}"))?;
    let _apartment = Apartment;
    let voice = chinese_voice()
        .map_err(|e| format!("无法读取语音列表：{e}"))?
        .ok_or("未找到中文语音，请在 Windows 语言设置中安装中文语音包后重试")?;
    play_with_voice(job, &voice).map_err(|e| format!("无法播放语音：{e}"))
}

fn play_with_voice(job: &Job, voice: &VoiceInformation) -> WinResult<()> {
    let synth = SpeechSynthesizer::new()?;
    synth.SetVoice(voice)?;
    synth.Options()?.SetSpeakingRate(1.1)?;
    let operation = synth.SynthesizeTextToStreamAsync(&HSTRING::from(job.text.as_str()))?;
    let (ready, stream) = mpsc::channel();
    operation.when(move |result| {
        let _ = ready.send(result);
    })?;
    let stream = match wait_for_audio(job, stream) {
        Ok(Some(stream)) => stream,
        outcome => {
            let _ = operation.Cancel();
            return outcome.map(|_| ());
        }
    };
    let source = MediaSource::CreateFromStream(&stream, &stream.ContentType()?)?;
    let player = MediaPlayer::new()?;
    let (failed, result) = mpsc::channel();
    let ended = failed.clone();
    player.CommandManager()?.SetIsEnabled(false)?;
    player.MediaEnded(&TypedEventHandler::new(move |_, _| {
        let _ = ended.send(Ok(()));
        Ok(())
    }))?;
    player.MediaFailed(&TypedEventHandler::new(move |_, _| {
        let _ = failed.send(Err(windows::core::Error::new(
            windows::Win32::Foundation::E_FAIL,
            "音频输出失败，请检查播放设备",
        )));
        Ok(())
    }))?;
    player.SetSource(&source)?;
    if job.cancelled.load(Ordering::Acquire) {
        return player.Close();
    }
    player.Play()?;
    let playback = wait_for_audio(job, result);
    player.Close()?;
    playback.map(|_| ())
}

fn wait_for_audio<T>(job: &Job, result: mpsc::Receiver<WinResult<T>>) -> WinResult<Option<T>> {
    let started = Instant::now();
    while !job.cancelled.load(Ordering::Acquire) {
        match result.recv_timeout(Duration::from_millis(40)) {
            Ok(outcome) => return outcome.map(Some),
            Err(RecvTimeoutError::Timeout) if started.elapsed() < Duration::from_secs(60) => {
                continue
            }
            _ => return Err(Error::new(E_FAIL, "语音处理已中断或超时")),
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::voice_rank;

    #[test]
    fn prefers_yaoyao_to_other_chinese_voices() {
        assert_eq!(voice_rank("zh-CN", "Microsoft Yaoyao"), Some(0));
        assert_eq!(voice_rank("zh-CN", "Microsoft Huihui"), Some(1));
        assert_eq!(voice_rank("zh-TW", "Microsoft Hanhan"), Some(2));
        assert_eq!(voice_rank("en-US", "Microsoft Zira"), None);
    }
}
