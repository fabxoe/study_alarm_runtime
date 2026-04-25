// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn trigger_alarm(title: String, msg: String, play_sound: bool, sound_name: String, volume: u32, loop_sound: bool) {
    use std::process::Command;
    use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
    use std::thread;

    let stop_sound = Arc::new(AtomicBool::new(false));
    let stop_sound_clone = stop_sound.clone();

    if play_sound {
        thread::spawn(move || {
            let vol_str = format!("{}", volume as f32 / 100.0);
            let path = format!("/System/Library/Sounds/{}.aiff", sound_name);

            loop {
                let mut proc = Command::new("afplay")
                    .arg("-v")
                    .arg(&vol_str)
                    .arg(&path)
                    .spawn();

                if let Ok(mut child) = proc {
                    loop {
                        if stop_sound_clone.load(Ordering::SeqCst) {
                            let _ = child.kill();
                            return;
                        }
                        if let Ok(Some(_)) = child.try_wait() {
                            break;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(100));
                    }
                } else {
                    break;
                }

                if !loop_sound || stop_sound_clone.load(Ordering::SeqCst) {
                    break;
                }
            }
        });
    }

    let safe_msg = msg.replace("\"", "'");
    let safe_title = title.replace("\"", "'");
    let alert_script = format!("tell app \"System Events\" to display alert \"{}\" message \"{}\" as critical", safe_title, safe_msg);
    let mut alert_proc = Command::new("osascript")
        .arg("-e")
        .arg(&alert_script)
        .spawn()
        .expect("Failed to spawn osascript");

    let _ = alert_proc.wait();
    stop_sound.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn set_zoom(window: tauri::Window, webview: tauri::Webview, zoom: f64) {
    let _ = webview.set_zoom(zoom);
    let _ = window.set_max_size(Some(tauri::Size::Logical(tauri::LogicalSize::new(420.0 * zoom, 1170.0 * zoom))));
    let _ = window.set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize::new(420.0 * zoom, 600.0 * zoom))));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, trigger_alarm, set_zoom])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
