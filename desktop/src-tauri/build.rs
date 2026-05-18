fn main() {
    println!("cargo:rerun-if-env-changed=SPROUT_RELAY_URL");
    println!("cargo:rerun-if-env-changed=SPROUT_RELAY_HTTP");
    println!("cargo:rerun-if-env-changed=SPROUT_UPDATER_PUBLIC_KEY");
    println!("cargo:rerun-if-env-changed=SPROUT_UPDATER_ENDPOINT");
    println!("cargo:rustc-check-cfg=cfg(sprout_updater_enabled)");

    if let Ok(relay_url) = std::env::var("SPROUT_RELAY_URL") {
        println!("cargo:rustc-env=SPROUT_DESKTOP_BUILD_RELAY_URL={relay_url}");
    }

    if let Ok(relay_http) = std::env::var("SPROUT_RELAY_HTTP") {
        println!("cargo:rustc-env=SPROUT_DESKTOP_BUILD_RELAY_HTTP={relay_http}");
    }

    let updater_public_key = std::env::var("SPROUT_UPDATER_PUBLIC_KEY")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let updater_endpoint = std::env::var("SPROUT_UPDATER_ENDPOINT")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if updater_public_key.is_some() && updater_endpoint.is_some() {
        println!("cargo:rustc-cfg=sprout_updater_enabled");
    }

    // When the `huddle` feature is off, restrict the ACL pattern to base
    // capabilities only. The huddle capability declares permissions for
    // `tauri-plugin-global-shortcut`, which isn't compiled in the light build —
    // leaving it in the scan path triggers `Permission global-shortcut:* not
    // found` from tauri-build's ACL validator. Cargo exposes enabled features
    // to build scripts via CARGO_FEATURE_<UPPER> env vars.
    let huddle_enabled = std::env::var_os("CARGO_FEATURE_HUDDLE").is_some();
    let attrs = if huddle_enabled {
        tauri_build::Attributes::default()
    } else {
        tauri_build::Attributes::default().capabilities_path_pattern("./capabilities/default.json")
    };
    tauri_build::try_build(attrs).expect("tauri-build failed");
}
