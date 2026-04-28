# SVG Processing And G-code Generation

SVG processing lives in [`backend/svg_processor.py`](../backend/svg_processor.py). It is a custom pipeline built on `svgpathtools`, `numpy`, and local dataclasses. It does not currently use `vpype`.

## Core Data Structures

| Type | Purpose |
| --- | --- |
| `Point` | Basic `{ x, y }` coordinate in SVG or plotter space. |
| `PathSegment` | Line, arc, or cubic Bezier segment with start/end/control/center metadata. |
| `ProcessedPath` | A path with sampled points and optional arc/circle/ellipse metadata for G-code output. |
| `ArcInfo`, `ArcSegment` | Arc-related structures; `ArcSegment` is present but not central to the current pipeline. |

## Preview Pipeline

`get_preview_paths()` is called by upload and reposition endpoints.

```text
load_svg()
  -> parse_svg_dimensions()
  -> filter with is_plottable()
  -> path_to_points()
  -> simplify_points() if optimization != none
  -> scale_and_position()
  -> optimize_paths()
  -> serialize points for frontend preview
```

Preview output shape:

```json
[
  {
    "points": [{ "x": 10.0, "y": 20.0 }],
    "layer": 0
  }
]
```

The current preview output has a fixed `layer: 0`; SVG layer/color metadata is not surfaced.

## Conversion Pipeline

`process_svg()` is called by `POST /api/convert` and `POST /api/plotter/plot`.

```text
load_svg()
  -> parse_svg_dimensions()
  -> filter with is_plottable()
  -> path_to_processed(use_arcs)
  -> simplify points for point-only paths when optimization != none
  -> scale_processed_paths()
  -> sort_processed_paths()
  -> to_gcode()
  -> stats
```

Stats include:

- `initial_paths`
- `final_paths`
- `total_points`
- `circles`
- `bounds`
- `gcode_lines`
- `dimensions`

## SVG Loading

`load_svg()` first parses CSS styles from `<style>` elements and then calls `svg2paths2(svg_path)`.

CSS parsing is intentionally narrow:

- It extracts class rules like `.className { key: value; }`.
- It stores properties in `self.css_styles`.
- It is used only for stroke/fill visibility checks.

If CSS parsing fails, processing continues without CSS-derived styles.

## Plottable Filtering

`is_plottable()` includes paths that have either:

- A stroke that is not `none` and does not have `stroke-width="0"`.
- A fill that is not `none`.

Additional behavior:

- Class-based CSS stroke/fill can make a path plottable.
- SVG's default fill is treated as a valid fill if no fill is specified.
- White filled shapes without a stroke are filtered out as likely canvas/background elements.

This means filled artwork is plotted as outlines from the SVG path geometry, not filled with hatch paths.

## Dimensions And Coordinate Handling

`parse_svg_dimensions()` prefers `viewBox`:

```text
viewBox="min-x min-y width height"
```

If no viewBox is present, it falls back to `width` and `height` attributes after stripping common units (`px`, `pt`, `mm`, `cm`, `in`, `%`). The stripped numeric values are used directly. Unit conversion is not generally performed there.

`scale_and_position()` uses SVG canvas dimensions when available. Otherwise it uses artwork bounds. This lets a small drawing inside a large SVG canvas preserve the larger SVG layout.

## Scale Modes

| Mode | Behavior |
| --- | --- |
| `fit` | Scale to fit the bed or artboard while preserving aspect ratio. |
| `original` | Treat SVG pixels as 96 DPI and convert by `25.4 / 96.0` mm per px. |
| `percent` | Scale by a percentage of the fit scale. |
| `width` | Scale to `target_width` if positive, else fit. |
| `height` | Scale to `target_height` if positive, else fit. |

The frontend currently exposes `fit`, `percent`, `width`, and `height`.

## Alignment

Supported alignment values:

- `center`
- `top-left`
- `top`
- `top-right`
- `left`
- `right`
- `bottom-left`
- `bottom`
- `bottom-right`
- `custom`

Plotter coordinates use a Cartesian model where Y increases upward. SVG coordinates usually increase downward. The processor flips Y during transform:

```text
new_y = scaled_height - (p.y - min_y) * scale + final_offset_y
```

When scaling `PathSegment` metadata, Y-axis flipping also reverses arc winding.

## Artboard Mode

When `artboard_enabled` is true, the artboard width/height are used as the effective placement container instead of the full bed. This affects scaling and alignment. It does not change firmware soft limits by itself.

The frontend default artboard is `360 x 480` mm.

## Point Sampling

`path_to_points()` preserves segment endpoints:

- `Line`: start and end only.
- Curves (`CubicBezier`, `QuadraticBezier`, `Arc`): interior samples plus endpoint.
- At least 10 samples are used for each curve.

This path is used by preview and as a fallback representation.

## Simplification

`simplify_points()` uses Ramer-Douglas-Peucker with corner preservation:

1. Convert points to a NumPy array.
2. Detect sharp corners with angle threshold `135` degrees.
3. Run iterative RDP while keeping endpoints and detected corners.
4. Default tolerance is `0.5`.

If simplification fails, the original points are used.

## Path Ordering

Three optimization modes are supported:

| Mode | Behavior |
| --- | --- |
| `none` | Keep source order and do not simplify point-only paths. |
| `greedy` | Repeatedly choose the nearest next path start from the current position. |
| `greedy_flip` | Choose nearest path start or end and reverse the path when its end is closer. |

Both preview paths and processed paths have sorting implementations. For processed paths, reversing a path also reverses segments and flips arc direction.

## Segment And Curve Handling

`path_to_segments()` converts SVG path segments for arc-aware G-code:

| SVG segment | Current conversion |
| --- | --- |
| `Line` | `PathSegment` line. |
| `CubicBezier` | Preserved as cubic Bezier metadata for `G5`. |
| `QuadraticBezier` | Converted to cubic controls and emitted as `G5`. |
| Circular `Arc` | Converted to `PathSegment` arc for `G2`/`G3`. |
| Elliptical `Arc` | Sampled into 10 line segments. |
| Unknown | Sampled as a line from `point(0)` to `point(1)` if possible. |

Several biarc fitting helpers exist (`bezier_to_biarcs`, `_fit_arc_through_three_points`, etc.), but the current `path_to_segments()` path preserves Beziers for `G5` rather than using those helpers for normal cubic output.

## G-code Output

`to_gcode()` emits this general shape:

```gcode
; Pen Plotter G-code
; Generated by penplotgui
; Profile: default
; Bed size: 426.0x599.0mm

G90 ; Absolute positioning
G28 ; Home axes
M5  ; Pen up

G0 X... Y... F...
M3
G1/G2/G3/G5/G6 ...
M5

; End of job
M5  ; Pen up
G0 X0 Y0 F... ; Return home
```

Coordinate precision is 4 decimal places. Feed rates are emitted with no decimal places.

## Generated Motion Commands

| Command | Source |
| --- | --- |
| `G0` | Travel to each path start and final return home. |
| `G1` | Lines and fallback sampled arcs. |
| `G2`/`G3` | Circular arcs when considered safe. |
| `G5` | Cubic Beziers. |
| `G6` | Full axis-aligned ellipses. |
| `M3` | Pen down before drawing each path. |
| `M5` | Pen up after each path and at end. |
| `G28` | Home at start. |
| `G90` | Absolute mode at start. |

## Arc Safety Fallback

Before emitting G2/G3 for a segment, the processor rejects arcs that are:

- Radius greater than `500` mm.
- Center outside the configured bed.
- Degenerate after coordinate rounding.
- Estimated to take more than `2.0` seconds at the draw feed rate.

Rejected arcs are approximated as G1 polyline points with a maximum step of `0.5` mm.

## Current Implementation Notes

- `detect_circle()` currently returns `None` for non-empty paths, so `ProcessedPath.is_circle` is not expected to be set by that function.
- The code after `return (Point(cx, cy), rx, ry)` in `detect_ellipse()` is unreachable circle-detection code.
- Axis-aligned ellipses represented by cubic Beziers can be detected and emitted as `G6`.
- Debug `print()` calls are present in preview and optimization paths.
- `Union` is imported but not used.
- Preview uses point sampling; plotting can use arc/Bezier commands. The preview is visually representative but not a one-to-one rendering of every final G-code command.
