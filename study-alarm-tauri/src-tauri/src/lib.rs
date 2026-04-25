// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

use std::sync::{Arc, Mutex};
use std::process::{Command, Child};
use tauri::{Manager, WebviewWindowBuilder};

pub struct AudioState(pub Arc<Mutex<Option<Child>>>);

#[tauri::command]
fn play_sound(state: tauri::State<AudioState>, sound_name: String, volume: u32, loop_sound: bool) {
    let mut child_guard = state.0.lock().unwrap();
    if let Some(mut old_child) = child_guard.take() {
        let _ = old_child.kill();
    }
    
    // We just spawn a simple sound. Loop handling could be done via a dedicated thread if needed,
    // but for now, we just play it once unless we implement complex looping.
    // To implement loop properly:
    let vol_str = format!("{}", volume as f32 / 100.0);
    let path = format!("/System/Library/Sounds/{}.aiff", sound_name);
    
    let child = Command::new("afplay")
        .arg("-v")
        .arg(&vol_str)
        .arg(&path)
        .spawn()
        .expect("Failed to spawn afplay");
        
    *child_guard = Some(child);
}

#[tauri::command]
fn stop_sound(state: tauri::State<AudioState>) {
    let mut child_guard = state.0.lock().unwrap();
    if let Some(mut child) = child_guard.take() {
        let _ = child.kill();
    }
}

#[tauri::command]
fn spawn_popup(app: tauri::AppHandle, url: String) {
    let window_label = format!("popup_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
    
    let popup = tauri::WebviewWindowBuilder::new(
        &app,
        window_label,
        tauri::WebviewUrl::App(url.into())
    )
    .title("알람")
    .inner_size(400.0, 200.0)
    .always_on_top(true)
    .center()
    .resizable(false)
    .decorations(false)
    .skip_taskbar(true)
    .accept_first_mouse(true)
    .build()
    .unwrap();
}

#[tauri::command]
fn set_zoom(window: tauri::Window, webview: tauri::Webview, zoom: f64) {
    let _ = webview.set_zoom(zoom);
    // 창 크기 강제 고정으로 블랙 박스 방지 (State 1 포함)
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(460.0 * zoom, 720.0 * zoom)));
}

#[tauri::command]
fn start_drag(window: tauri::Window) {
    let _ = window.start_dragging();
}

#[tauri::command]
fn show_window(window: tauri::Window) {
    let _ = window.show();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AudioState(Arc::new(Mutex::new(None))))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![play_sound, stop_sound, spawn_popup, set_zoom, start_drag, show_window])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
