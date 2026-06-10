//! Startup window fitting. The config asks for a fixed 1280×820 (logical),
//! which suits large displays but overflows small ones — on a MacBook the
//! window's bottom edge sinks under the Dock, hiding part of the UI. At
//! startup (while the window is still hidden) we clamp its size to the
//! monitor's *work area* — the screen minus Dock / menu bar / taskbar — and
//! center it there. All math is in physical pixels.

/// Clamped size + centered position, in physical pixels.
#[derive(Debug, PartialEq, Eq)]
pub struct WindowFit {
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
}

/// Fit a `desired` (width, height) into the work area at `work_pos` with
/// `work_size`: clamp each dimension to the work area, then center the result
/// within it. The work-area position matters — a secondary monitor's origin
/// can be negative, and the macOS menu bar offsets the work area's y.
pub fn fit_to_work_area(
    work_pos: (i32, i32),
    work_size: (u32, u32),
    desired: (u32, u32),
) -> WindowFit {
    let width = desired.0.min(work_size.0);
    let height = desired.1.min(work_size.1);
    let x = work_pos.0 + ((work_size.0 - width) / 2) as i32;
    let y = work_pos.1 + ((work_size.1 - height) / 2) as i32;
    WindowFit {
        width,
        height,
        x,
        y,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_size_and_centers_when_window_fits() {
        let fit = fit_to_work_area((0, 0), (2560, 1400), (1280, 820));
        assert_eq!(
            fit,
            WindowFit {
                width: 1280,
                height: 820,
                x: 640,
                y: 290
            }
        );
    }

    #[test]
    fn clamps_height_to_macbook_work_area() {
        // MacBook-like: menu bar pushes the work area down to y=25, the Dock
        // shaves the bottom. The 820-tall window must shrink to fit above it.
        let fit = fit_to_work_area((0, 25), (1440, 805), (1280, 820));
        assert_eq!(
            fit,
            WindowFit {
                width: 1280,
                height: 805,
                x: 80,
                y: 25
            }
        );
    }

    #[test]
    fn clamps_both_dimensions_on_a_tiny_screen() {
        let fit = fit_to_work_area((0, 0), (1024, 600), (1280, 820));
        assert_eq!(
            fit,
            WindowFit {
                width: 1024,
                height: 600,
                x: 0,
                y: 0
            }
        );
    }

    #[test]
    fn centers_within_a_negatively_positioned_monitor() {
        // Secondary monitor to the left of the primary: origin is negative.
        let fit = fit_to_work_area((-1920, 0), (1920, 1040), (1280, 820));
        assert_eq!(
            fit,
            WindowFit {
                width: 1280,
                height: 820,
                x: -1600,
                y: 110
            }
        );
    }
}
