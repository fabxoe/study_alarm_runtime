use std::process::Child;
#[cfg(target_os = "macos")]
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::{Emitter, Listener, Manager, WebviewWindow};

#[cfg(target_os = "macos")]
fn spawn_sound_process(name: &str, volume: f32) -> std::io::Result<Child> {
    let path = format!("/System/Library/Sounds/{}.aiff", name);

    Command::new("afplay")
        .arg("-v")
        .arg(volume.clamp(0.0, 1.0).to_string())
        .arg(path)
        .spawn()
}

#[cfg(target_os = "windows")]
fn windows_sound_path(name: &str) -> std::path::PathBuf {
    // Windows UI에서는 실제 시스템 WAV 이름을 그대로 전달합니다.
    // 아래의 macOS 이름 매핑은 이전 Windows 빌드와의 호환을 위해 유지합니다.
    let file_name = match name {
        "Alarm01" => "Alarm01.wav",
        "Windows Notify Calendar" => "Windows Notify Calendar.wav",
        "Alarm08" => "Alarm08.wav",
        "Windows Ding" => "Windows Ding.wav",
        "Bottle" => "Windows Notify System Generic.wav",
        "Glass" => "Windows Foreground.wav",
        "Ping" => "Windows Ding.wav",
        "Funk" => "Alarm01.wav",
        "Tink" => "Windows Notify.wav",
        "Hero" => "Windows Logon.wav",
        "Basso" => "Windows Critical Stop.wav",
        "Blow" => "Windows Hardware Insert.wav",
        "Frog" => "Ring03.wav",
        "Morse" => "Ring05.wav",
        "Pop" => "Windows Pop-up Blocked.wav",
        "Purr" => "Ring06.wav",
        "Sosumi" => "Alarm08.wav",
        "Submarine" => "Windows Hardware Fail.wav",
        _ => "Windows Notify System Generic.wav",
    };
    let windows_dir = std::env::var_os("WINDIR").unwrap_or_else(|| "C:\\Windows".into());
    std::path::PathBuf::from(windows_dir)
        .join("Media")
        .join(file_name)
}

#[cfg(target_os = "windows")]
pub struct WindowsPlayback {
    _device: rodio::MixerDeviceSink,
    player: rodio::Player,
}

#[cfg(target_os = "windows")]
fn play_windows_sound(
    name: &str,
    volume: f32,
    looping: bool,
) -> Result<WindowsPlayback, Box<dyn std::error::Error + Send + Sync>> {
    use rodio::Source;

    let path = windows_sound_path(name);
    let device = rodio::DeviceSinkBuilder::open_default_sink()?;
    let player = rodio::Player::connect_new(device.mixer());
    let decoder = rodio::Decoder::try_from(std::fs::File::open(path)?)?;

    // 0.0~1.0 슬라이더 값을 이 알람 재생에만 적용합니다.
    // Windows 시스템 전체 볼륨이나 다른 앱의 오디오에는 영향을 주지 않습니다.
    player.set_volume(volume.clamp(0.0, 1.0));
    if looping {
        player.append(decoder.repeat_infinite());
    } else {
        player.append(decoder);
    }

    Ok(WindowsPlayback {
        _device: device,
        player,
    })
}

#[cfg(target_os = "windows")]
fn stop_windows_sound(playback: &Arc<Mutex<Option<WindowsPlayback>>>) {
    if let Some(current) = playback.lock().unwrap().take() {
        current.player.stop();
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn spawn_sound_process(_name: &str, _volume: f32) -> std::io::Result<Child> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "sound playback is not configured for this platform",
    ))
}

pub struct AudioState {
    pub child: Arc<Mutex<Option<Child>>>,
    pub looping: Arc<AtomicBool>,
    #[cfg(target_os = "windows")]
    pub windows_playback: Arc<Mutex<Option<WindowsPlayback>>>,
}

#[tauri::command]
fn show_window(window: WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
}

#[tauri::command]
async fn update_window_config(
    window: WebviewWindow,
    zoom: f64,
    min_h: f64,
    max_h: f64,
    target_h: f64,
    resizable: bool,
) {
    let base_w = 460.0;
    let new_w = base_w * zoom;
    let size = tauri::Size::Logical(tauri::LogicalSize::new(new_w, target_h));

    // 이전 zoom 단계의 제약이 새 단계와 충돌하지 않도록 먼저 초기화합니다.
    let _ = window.set_resizable(true);
    let _ = window.set_min_size(None::<tauri::Size>);
    let _ = window.set_max_size(None::<tauri::Size>);

    if !resizable {
        // 플로우 모드: 컨텐츠 높이로 고정
        let _ = window.set_min_size(Some(size));
        let _ = window.set_max_size(Some(size));
        let _ = window.set_size(size);
        let _ = window.set_resizable(false);
    } else {
        // 스케줄 모드: 세로 리사이즈를 허용하고 모니터 사용 가능 높이까지 펼칠 수 있게 합니다.
        let _ = window.set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize::new(
            new_w, min_h,
        ))));
        let _ = window.set_max_size(Some(tauri::Size::Logical(tauri::LogicalSize::new(
            new_w, max_h,
        ))));
        let _ = window.set_size(size);
    }

    // Windows는 기존 창 위치를 유지한 채 높이만 늘리면 하단이 작업표시줄 아래로
    // 내려갈 수 있으므로, 확대/축소 후 작업영역 안에 들어오도록 다시 중앙 배치합니다.
    #[cfg(target_os = "windows")]
    let _ = window.center();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let audio_state = AudioState {
        child: Arc::new(Mutex::new(None)),
        looping: Arc::new(AtomicBool::new(false)),
        #[cfg(target_os = "windows")]
        windows_playback: Arc::new(Mutex::new(None)),
    };

    #[cfg(not(target_os = "windows"))]
    let child_mutex = audio_state.child.clone();
    #[cfg(target_os = "windows")]
    let windows_playback = audio_state.windows_playback.clone();
    let looping_flag = audio_state.looping.clone();

    tauri::Builder::default()
        .manage(audio_state)
        .setup(move |app| {
            // macOS에서는 Command 조합이 웹뷰까지 전달되기 전에 네이티브 메뉴가
            // 처리할 수 있으므로 확대/축소 단축키를 메뉴 accelerator로 등록합니다.
            let zoom_in =
                MenuItem::with_id(app, "zoom_in", "확대", true, Some("CmdOrCtrl+Shift+="))?;
            let zoom_in_equal = MenuItem::with_id(
                app,
                "zoom_in_equal",
                "확대 (대체 단축키)",
                true,
                Some("CmdOrCtrl+="),
            )?;
            let zoom_out = MenuItem::with_id(app, "zoom_out", "축소", true, Some("CmdOrCtrl+-"))?;
            let zoom_reset =
                MenuItem::with_id(app, "zoom_reset", "실제 크기", true, Some("CmdOrCtrl+0"))?;
            let view_menu = Submenu::with_items(
                app,
                "보기",
                true,
                &[&zoom_in, &zoom_in_equal, &zoom_out, &zoom_reset],
            )?;
            let menu = Menu::with_items(app, &[&view_menu])?;
            let _ = app.set_menu(menu);

            // 초기 윈도우 제약 조건 설정 (최소 높이를 낮게 잡아 모든 모드 대응)
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize::new(
                    460.0, 200.0,
                ))));
                let _ = window.set_max_size(Some(tauri::Size::Logical(tauri::LogicalSize::new(
                    460.0, 2000.0,
                ))));
            }

            // 소리 재생 이벤트 리스너
            #[cfg(not(target_os = "windows"))]
            let child_mutex_for_play = child_mutex.clone();
            #[cfg(target_os = "windows")]
            let windows_playback_for_play = windows_playback.clone();
            let looping_flag_for_play = looping_flag.clone();
            app.listen_any("playsound", move |event| {
                #[derive(serde::Deserialize)]
                struct PlaySoundPayload {
                    name: String,
                    #[serde(default)]
                    looping: bool,
                    #[serde(default = "default_volume")]
                    volume: f32,
                }
                fn default_volume() -> f32 {
                    0.8
                }

                if let Ok(payload) = serde_json::from_str::<PlaySoundPayload>(event.payload()) {
                    #[cfg(target_os = "windows")]
                    {
                        // 이전 소리를 먼저 중지한 뒤 네이티브 비동기 재생을 즉시 시작합니다.
                        // PowerShell 생성 지연이 없어 팝업과 소리가 거의 동시에 동작합니다.
                        looping_flag_for_play.store(false, Ordering::SeqCst);
                        stop_windows_sound(&windows_playback_for_play);
                        if let Ok(playback) =
                            play_windows_sound(&payload.name, payload.volume, payload.looping)
                        {
                            *windows_playback_for_play.lock().unwrap() = Some(playback);
                        }
                    }

                    #[cfg(not(target_os = "windows"))]
                    {
                        // 1. 기존 재생 중지 및 루프 종료 시그널
                        looping_flag_for_play.store(false, Ordering::SeqCst);
                        {
                            let mut guard = child_mutex_for_play.lock().unwrap();
                            if let Some(mut old_child) = guard.take() {
                                let _ = old_child.kill();
                            }
                        }

                        if payload.looping {
                            looping_flag_for_play.store(true, Ordering::SeqCst);
                            let child_mutex_loop = child_mutex_for_play.clone();
                            let looping_flag_loop = looping_flag_for_play.clone();
                            let sound_name = payload.name.clone();
                            let volume = payload.volume;

                            std::thread::spawn(move || {
                                while looping_flag_loop.load(Ordering::SeqCst) {
                                    let mut child = match spawn_sound_process(&sound_name, volume) {
                                        Ok(c) => c,
                                        Err(_) => break,
                                    };

                                    {
                                        let mut guard = child_mutex_loop.lock().unwrap();
                                        if !looping_flag_loop.load(Ordering::SeqCst) {
                                            let _ = child.kill();
                                            break;
                                        }
                                        *guard = Some(child);
                                    }

                                    // 소리 재생이 완료되거나 중지될 때까지 폴링
                                    loop {
                                        std::thread::sleep(std::time::Duration::from_millis(200));

                                        let mut guard = child_mutex_loop.lock().unwrap();

                                        // 루프 종료 확인
                                        if !looping_flag_loop.load(Ordering::SeqCst) {
                                            if let Some(mut c) = guard.take() {
                                                let _ = c.kill();
                                            }
                                            break;
                                        }

                                        // 프로세스 종료 여부 확인
                                        if let Some(c) = guard.as_mut() {
                                            match c.try_wait() {
                                                Ok(Some(_)) => {
                                                    *guard = None;
                                                    break; // 재생 완료 -> 다음 루프
                                                }
                                                Ok(None) => {} // 아직 재생 중
                                                Err(_) => {
                                                    *guard = None;
                                                    break;
                                                }
                                            }
                                        } else {
                                            // 다른 곳(stopsound 등)에서 이미 프로세스를 종료하고 None으로 만듦
                                            break;
                                        }
                                    }
                                }
                            });
                        } else {
                            if let Ok(child) = spawn_sound_process(&payload.name, payload.volume) {
                                let mut guard = child_mutex_for_play.lock().unwrap();
                                *guard = Some(child);
                            }
                        }
                    }
                }
            });

            // 소리 중지 이벤트 리스너
            #[cfg(not(target_os = "windows"))]
            let child_mutex_for_stop = child_mutex.clone();
            #[cfg(target_os = "windows")]
            let windows_playback_for_stop = windows_playback.clone();
            let looping_flag_for_stop = looping_flag.clone();
            app.listen_any("stopsound", move |_| {
                looping_flag_for_stop.store(false, Ordering::SeqCst);

                #[cfg(target_os = "windows")]
                stop_windows_sound(&windows_playback_for_stop);

                #[cfg(not(target_os = "windows"))]
                {
                    let mut guard = child_mutex_for_stop.lock().unwrap();
                    if let Some(mut child) = guard.take() {
                        let _ = child.kill();
                    }
                }
            });

            Ok(())
        })
        .on_menu_event(|app, event| {
            let action = match event.id().as_ref() {
                "zoom_in" | "zoom_in_equal" => Some("in"),
                "zoom_out" => Some("out"),
                "zoom_reset" => Some("reset"),
                _ => None,
            };

            if let Some(action) = action {
                let _ = app.emit("zoom-action", action);
            }
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![show_window, update_window_config])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
