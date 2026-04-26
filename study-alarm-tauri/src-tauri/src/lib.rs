use tauri::{Listener, Manager};
use std::process::{Command, Child};
use std::sync::{Arc, Mutex};

pub struct AudioState(pub Arc<Mutex<Option<Child>>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let audio_state = AudioState(Arc::new(Mutex::new(None)));
    let audio_state_for_event = audio_state.0.clone();
    let audio_state_for_stop = audio_state.0.clone();

    tauri::Builder::default()
        .manage(audio_state)
        .setup(move |app| {
            let app_handle = app.handle().clone();
            
            // 초기 윈도우 제약 조건 설정 (460x580) - 하단 인터페이스 보호를 위해 상향
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize::new(460.0, 550.0))));
                let _ = window.set_max_size(Some(tauri::Size::Logical(tauri::LogicalSize::new(460.0, 2000.0))));
            }
            
            // 줌 조절 이벤트 리스너
            app.listen_any("setzoom-event", move |event| {
                #[derive(serde::Deserialize)]
                #[serde(rename_all = "camelCase")]
                struct ZoomPayload { 
                    zoom: f64, 
                    extra_height: f64, 
                    min_height: f64, 
                    max_height: f64,
                    base_height: f64 
                }
                
                if let Ok(payload) = serde_json::from_str::<ZoomPayload>(event.payload()) {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let zoom = payload.zoom;
                        let extra_h = payload.extra_height;
                        let min_h = payload.min_height;
                        let max_h = payload.max_height;
                        let base_h = payload.base_height;

                        let base_w = 460.0;
                        let new_w = base_w * zoom;
                        let new_h = (base_h + extra_h) * zoom;

                        let _ = window.set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize::new(new_w, min_h))));
                        let _ = window.set_max_size(Some(tauri::Size::Logical(tauri::LogicalSize::new(new_w, max_h))));
                        let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(new_w, new_h)));
                    }
                }
            });

            // 소리 재생 이벤트 리스너
            let state_clone = audio_state_for_event.clone();
            app.listen_any("playsound", move |event| {
                // ... (기존 코드 유지)
                if let Ok(name) = serde_json::from_str::<String>(event.payload()) {
                    let mut child_guard = state_clone.lock().unwrap();
                    if let Some(mut old_child) = child_guard.take() {
                        let _ = old_child.kill();
                    }
                    let path = format!("/System/Library/Sounds/{}.aiff", name);
                    if let Ok(child) = Command::new("afplay").arg(&path).spawn() {
                        *child_guard = Some(child);
                    }
                }
            });

            // 소리 중지 이벤트 리스너
            let state_stop_clone = audio_state_for_stop.clone();
            app.listen_any("stopsound", move |_| {
                let mut child_guard = state_stop_clone.lock().unwrap();
                if let Some(mut child) = child_guard.take() {
                    let _ = child.kill();
                }
            });

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
