# Controls and controller support

## Keyboard / mouse (unchanged)
WASD / arrows move · mouse look · Shift run · Esc pause · F3 debug panel.

## Controller (browser Gamepad API)
Standard-mapping pads (Xbox/XInput, DualShock/DualSense in Chrome/Edge/Firefox). Pads without `standard` mapping are used best-effort (axes 0–3, buttons by standard index); the F3 panel shows the mapping.

| Input | In game | In menus |
| --- | --- | --- |
| Left stick | Analog move, relative to view direction | Up/down/left/right navigation (with repeat) |
| Right stick | Look yaw/pitch (frame-rate independent, response curve exponent 1.5) | — |
| L3 | Toggle sprint (ends when the stick is released) | — |
| A / Cross | Interact (input only, no gameplay yet) | Activate focused control |
| B / Circle | Crouch, held (input only, no gameplay yet) | Back (from Settings) |
| Start / Options | Pause | Resume / start |
| D-pad | — | Navigate; left/right adjusts sliders and dropdowns |

### Settings (saved in `nullrooms.settings`, also in F3 panel)
- `padSens` Controller look sensitivity (10–100, default 50; 50 = 2.6 rad/s at full deflection)
- `padDead` Deadzone for both sticks (0–40 %, default 15; radial, rescaled so output starts at 0)
- `padInvertY` Invert Y for the right stick

### Behaviour
- Button edges are detected per frame; buttons already held when a pad connects or a menu opens do not trigger.
- Input method switches automatically (`KBM` / `PAD`); the menu focus ring only shows while using the pad.
- Starting from the pad tries pointer lock first. If the browser refuses it (no mouse gesture), the game runs in *controller-only* mode: no mouse capture, mouse look disabled, Esc or Start pauses.
- Disconnect zeroes stick state and sprint latch; in controller-only mode it pauses the game. With mouse capture active the game continues on keyboard/mouse.
- F3 panel shows pad name, mapping, raw/processed sticks, pressed buttons and action state.

### Known limitations
- Not tested on physical hardware in this change; automated check used a mocked `navigator.getGamepads()` in headless Chromium.
- Whether a gamepad press counts as a user gesture for pointer lock differs between browsers; the fallback mode covers refusal.
- No rumble, remapping, or dev-panel navigation by pad.
