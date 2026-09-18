// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  #[cfg(target_os = "linux")]
  {
    // Fix WebKitGTK rendering glitches and crashes on Linux (especially Wayland/NVIDIA/Intel)
    if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
      std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    // WebKitGTK (GTK3) lacks support for Wayland fractional scaling (wp_fractional_scale_v1),
    // which leads to severe aspect-ratio squashing and misaligned pointer click coordinates (click offset).
    // Preferring x11 over wayland (when XWayland is available) avoids the fractional scaling desync,
    // while seamlessly falling back to native wayland if X11 is not present.
    if std::env::var("OWNNOTES_FORCE_WAYLAND").unwrap_or_default() != "1" {
      std::env::set_var("GDK_BACKEND", "x11,wayland");
    }
  }

  app_lib::run();
}
