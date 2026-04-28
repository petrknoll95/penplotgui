import svgpathtools
from svgpathtools import svg2paths2, Line, Path, Arc, CubicBezier, QuadraticBezier
import numpy as np
import math
import re
import xml.etree.ElementTree as ET
from typing import Optional, Literal, Union
from dataclasses import dataclass, field

OptimizationMethod = Literal["none", "greedy", "greedy_flip"]

from config import PlotterProfile


@dataclass
class Point:
    x: float
    y: float


@dataclass
class ArcInfo:
    """Information about a circular arc for G2/G3 generation."""
    center_x: float
    center_y: float
    radius: float
    start_angle: float  # radians
    end_angle: float    # radians
    clockwise: bool


@dataclass
class ArcSegment:
    """A circular arc segment for G2/G3 output."""
    start: Point
    end: Point
    center: Point
    radius: float
    clockwise: bool  # True = G2 (CW), False = G3 (CCW)


@dataclass
class PathSegment:
    """A segment of a path - line, arc, or bezier."""
    is_arc: bool
    start: Point
    end: Point
    # For arcs only:
    center: Optional[Point] = None
    radius: float = 0.0
    clockwise: bool = True
    # For bezier only:
    is_bezier: bool = False
    control1: Optional[Point] = None
    control2: Optional[Point] = None


@dataclass
class ProcessedPath:
    """A processed path that may contain arc information."""
    points: list[Point]
    segments: list[PathSegment] = field(default_factory=list)  # Arc-aware segments
    is_circle: bool = False
    arc_info: Optional[ArcInfo] = None
    # For circles, we store center and radius for G2/G3 generation
    circle_center: Optional[Point] = None
    circle_radius: float = 0.0
    # For ellipses (axis-aligned)
    is_ellipse: bool = False
    ellipse_center: Optional[Point] = None
    ellipse_rx: float = 0.0
    ellipse_ry: float = 0.0


class SVGProcessor:
    """Process SVG files for pen plotter optimization."""

    def __init__(self, profile: PlotterProfile):
        self.profile = profile
        self.css_styles: dict[str, dict[str, str]] = {}

    def parse_css_styles(self, svg_path: str) -> dict[str, dict[str, str]]:
        """
        Parse CSS styles from <style> elements in the SVG.
        Returns a dict mapping class names to their style properties.
        """
        styles: dict[str, dict[str, str]] = {}
        try:
            tree = ET.parse(svg_path)
            root = tree.getroot()

            # Handle SVG namespace
            ns = {'svg': 'http://www.w3.org/2000/svg'}

            # Find all style elements
            for style_elem in root.iter():
                if style_elem.tag.endswith('style') and style_elem.text:
                    css_text = style_elem.text
                    # Parse CSS rules: .classname { property: value; ... }
                    pattern = r'\.([a-zA-Z0-9_-]+)\s*\{([^}]+)\}'
                    for match in re.finditer(pattern, css_text):
                        class_name = match.group(1)
                        props_text = match.group(2)
                        props = {}
                        for prop in props_text.split(';'):
                            prop = prop.strip()
                            if ':' in prop:
                                key, value = prop.split(':', 1)
                                props[key.strip()] = value.strip()
                        styles[class_name] = props
        except Exception as e:
            # If CSS parsing fails, continue without styles
            pass
        return styles

    def load_svg(self, svg_path: str) -> tuple[list[Path], list[dict], dict]:
        """Load an SVG file and return paths, element attributes, and SVG attributes."""
        # Parse CSS styles first
        self.css_styles = self.parse_css_styles(svg_path)
        paths, attributes, svg_attributes = svg2paths2(svg_path)
        return paths, attributes, svg_attributes

    def parse_svg_dimensions(self, svg_attributes: dict) -> tuple[Optional[float], Optional[float], float, float]:
        """
        Parse SVG dimensions from viewBox or width/height attributes.
        Returns (width, height, min_x, min_y) in SVG units, or (None, None, 0, 0) if not determinable.
        """
        # Try viewBox first (most reliable)
        viewbox = svg_attributes.get('viewBox', '')
        if viewbox:
            parts = viewbox.replace(',', ' ').split()
            if len(parts) == 4:
                try:
                    # viewBox = "min-x min-y width height"
                    min_x = float(parts[0])
                    min_y = float(parts[1])
                    width = float(parts[2])
                    height = float(parts[3])
                    return width, height, min_x, min_y
                except ValueError:
                    pass

        # Fall back to width/height attributes
        width_str = svg_attributes.get('width', '')
        height_str = svg_attributes.get('height', '')

        def parse_length(s: str) -> Optional[float]:
            """Parse SVG length, stripping units."""
            if not s:
                return None
            # Remove common units
            s = s.strip()
            for unit in ['px', 'pt', 'mm', 'cm', 'in', '%']:
                if s.endswith(unit):
                    s = s[:-len(unit)]
                    break
            try:
                return float(s)
            except ValueError:
                return None

        width = parse_length(width_str)
        height = parse_length(height_str)

        if width and height:
            return width, height, 0, 0

        return None, None, 0, 0

    def get_svg_bounds(self, svg_attributes: dict, artwork_bounds: dict) -> dict:
        """
        Get the effective bounds for an SVG, preferring SVG dimensions over artwork bounds.
        This ensures a small circle in a large SVG respects the SVG canvas size.
        """
        svg_width, svg_height, min_x, min_y = self.parse_svg_dimensions(svg_attributes)

        if svg_width and svg_height:
            # Use SVG dimensions
            return {
                "x_min": min_x,
                "y_min": min_y,
                "x_max": min_x + svg_width,
                "y_max": min_y + svg_height,
                "width": svg_width,
                "height": svg_height,
            }

        # Fall back to artwork bounds
        return artwork_bounds

    def is_plottable(self, attr: dict) -> bool:
        """
        Check if a path should be plotted based on its attributes.

        Includes paths that have:
        - A stroke (not "none", not width 0)
        - OR a fill (not "none") - these will be plotted as outlines

        Excludes paths that are completely invisible (no stroke AND no fill).
        """
        style = attr.get('style', '')
        class_attr = attr.get('class', '')

        # Check for stroke
        stroke_value = attr.get('stroke', '').lower()
        stroke_in_style = 'stroke:' in style and 'stroke:none' not in style.lower()
        stroke_in_css = False
        if class_attr and self.css_styles:
            for class_name in class_attr.split():
                if class_name in self.css_styles:
                    css_props = self.css_styles[class_name]
                    css_stroke = css_props.get('stroke', '').lower()
                    if css_stroke and css_stroke != 'none':
                        stroke_in_css = True
                        break

        has_valid_stroke = False
        if stroke_value and stroke_value != 'none':
            stroke_width = attr.get('stroke-width', '1')
            if stroke_width != '0':
                has_valid_stroke = True
        elif stroke_in_style or stroke_in_css:
            has_valid_stroke = True

        # Check for fill (filled shapes can be plotted as outlines)
        fill_value = attr.get('fill', '').lower()
        fill_in_style = 'fill:' in style and 'fill:none' not in style.lower()
        fill_in_css = False
        if class_attr and self.css_styles:
            for class_name in class_attr.split():
                if class_name in self.css_styles:
                    css_props = self.css_styles[class_name]
                    css_fill = css_props.get('fill', '').lower()
                    if css_fill and css_fill != 'none':
                        fill_in_css = True
                        break

        has_valid_fill = False
        if fill_value and fill_value != 'none':
            has_valid_fill = True
        elif fill_in_style or fill_in_css:
            has_valid_fill = True
        # Default SVG fill is black if not specified
        if not fill_value and 'fill:' not in style.lower():
            has_valid_fill = True

        # Filter out background elements (white fill, no stroke)
        # These are typically canvas backgrounds, not artwork
        if has_valid_fill and not has_valid_stroke:
            white_values = {'white', '#fff', '#ffffff', 'rgb(255,255,255)', 'rgb(255, 255, 255)'}
            if fill_value in white_values:
                return False
            # Also check style for white fill
            style_lower = style.lower()
            if 'fill:white' in style_lower or 'fill:#fff' in style_lower or 'fill:#ffffff' in style_lower:
                return False

        return has_valid_stroke or has_valid_fill

    def bezier_to_biarcs(self, bezier: CubicBezier, tolerance: float = 0.1, depth: int = 0) -> list[PathSegment]:
        """
        Convert a cubic Bezier curve to circular arcs.

        Strategy: Try to fit a single arc first. If error is too high, subdivide.
        This produces fewer, larger arcs than traditional biarc fitting.

        Args:
            bezier: A cubic Bezier curve segment
            tolerance: Maximum allowed deviation from the true curve (in SVG units)
            depth: Recursion depth (to prevent infinite recursion)

        Returns:
            List of PathSegment objects (arcs or lines)
        """
        # Get start and end points
        p0 = Point(bezier.start.real, bezier.start.imag)
        p3 = Point(bezier.end.real, bezier.end.imag)

        # Check if the curve is nearly a straight line
        if self._bezier_is_flat(bezier, tolerance * 0.5):
            return [PathSegment(is_arc=False, start=p0, end=p3)]

        # Limit recursion depth
        if depth > 8:
            return [PathSegment(is_arc=False, start=p0, end=p3)]

        # Try to fit a single arc through start, midpoint, and end
        mid_t = bezier.point(0.5)
        mid = Point(mid_t.real, mid_t.imag)

        arc = self._fit_arc_through_three_points(p0, mid, p3)

        if arc is not None:
            # Check error at multiple points along the bezier
            max_error = self._arc_error(bezier, arc)

            if max_error <= tolerance:
                return [arc]

        # Single arc didn't work well enough - subdivide
        left, right = self._split_bezier(bezier, 0.5)

        segments = []
        segments.extend(self.bezier_to_biarcs(left, tolerance, depth + 1))
        segments.extend(self.bezier_to_biarcs(right, tolerance, depth + 1))

        return segments

    def _fit_arc_through_three_points(self, p1: Point, p2: Point, p3: Point) -> Optional[PathSegment]:
        """
        Fit a circular arc through three points.

        Returns PathSegment with arc parameters, or None if points are collinear.
        """
        # Calculate the circumcenter of the triangle formed by the three points
        ax, ay = p1.x, p1.y
        bx, by = p2.x, p2.y
        cx, cy = p3.x, p3.y

        d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))

        if abs(d) < 1e-10:
            # Points are collinear - return line
            return PathSegment(is_arc=False, start=p1, end=p3)

        ax2_ay2 = ax * ax + ay * ay
        bx2_by2 = bx * bx + by * by
        cx2_cy2 = cx * cx + cy * cy

        ux = (ax2_ay2 * (by - cy) + bx2_by2 * (cy - ay) + cx2_cy2 * (ay - by)) / d
        uy = (ax2_ay2 * (cx - bx) + bx2_by2 * (ax - cx) + cx2_cy2 * (bx - ax)) / d

        center = Point(ux, uy)
        radius = math.sqrt((ax - ux) ** 2 + (ay - uy) ** 2)

        if radius < 0.01 or radius > 10000:
            # Radius too extreme - use line segment instead
            return PathSegment(is_arc=False, start=p1, end=p3)

        # Determine arc direction (CW or CCW)
        # Use cross product of (p1-center) x (p3-center)
        v1x, v1y = p1.x - center.x, p1.y - center.y
        v3x, v3y = p3.x - center.x, p3.y - center.y
        cross = v1x * v3y - v1y * v3x

        # Also check that p2 is on the correct arc (not the long way around)
        # Calculate angles
        angle1 = math.atan2(v1y, v1x)
        angle2 = math.atan2(p2.y - center.y, p2.x - center.x)
        angle3 = math.atan2(v3y, v3x)

        # Normalize angles
        def normalize_angle(a):
            while a < 0:
                a += 2 * math.pi
            while a >= 2 * math.pi:
                a -= 2 * math.pi
            return a

        angle1 = normalize_angle(angle1)
        angle2 = normalize_angle(angle2)
        angle3 = normalize_angle(angle3)

        # Check if going CW from angle1 to angle3 passes through angle2
        def angle_between_cw(start, mid, end):
            """Check if mid is between start and end going clockwise."""
            if start > end:
                return mid <= start and mid >= end
            else:
                return mid <= start or mid >= end

        def angle_between_ccw(start, mid, end):
            """Check if mid is between start and end going counter-clockwise."""
            if start < end:
                return mid >= start and mid <= end
            else:
                return mid >= start or mid <= end

        # Determine correct direction
        if angle_between_cw(angle1, angle2, angle3):
            clockwise = True
        elif angle_between_ccw(angle1, angle2, angle3):
            clockwise = False
        else:
            # Fallback based on cross product
            clockwise = cross < 0

        return PathSegment(
            is_arc=True,
            start=p1,
            end=p3,
            center=center,
            radius=radius,
            clockwise=clockwise
        )

    def _arc_error(self, bezier: CubicBezier, arc: PathSegment) -> float:
        """Calculate maximum error between Bezier curve and arc approximation."""
        if not arc.is_arc or arc.center is None:
            return float('inf')

        max_error = 0.0

        # Sample points along the Bezier (skip endpoints which are exact)
        for i in range(1, 10):
            t = i / 10.0
            bp = bezier.point(t)
            bezier_pt = Point(bp.real, bp.imag)

            # Distance from bezier point to arc (difference from radius)
            dist_to_center = math.sqrt(
                (bezier_pt.x - arc.center.x) ** 2 +
                (bezier_pt.y - arc.center.y) ** 2
            )
            error = abs(dist_to_center - arc.radius)
            max_error = max(max_error, error)

        return max_error

    def _bezier_is_flat(self, bezier: CubicBezier, tolerance: float) -> bool:
        """Check if a Bezier curve is flat enough to be treated as a line."""
        p0 = complex(bezier.start.real, bezier.start.imag)
        p1 = complex(bezier.control1.real, bezier.control1.imag)
        p2 = complex(bezier.control2.real, bezier.control2.imag)
        p3 = complex(bezier.end.real, bezier.end.imag)

        # Calculate distance from control points to the line p0-p3
        line_vec = p3 - p0
        line_len = abs(line_vec)

        if line_len < 1e-10:
            # Start and end are the same point
            return abs(p1 - p0) < tolerance and abs(p2 - p0) < tolerance

        line_unit = line_vec / line_len

        # Distance from p1 to line
        v1 = p1 - p0
        d1 = abs(v1 - (v1.real * line_unit.real + v1.imag * line_unit.imag) * line_unit)

        # Distance from p2 to line
        v2 = p2 - p0
        d2 = abs(v2 - (v2.real * line_unit.real + v2.imag * line_unit.imag) * line_unit)

        return d1 < tolerance and d2 < tolerance

    def _fit_biarc(self, p0: Point, t0: Point, p3: Point, t3: Point) -> Optional[tuple[PathSegment, PathSegment]]:
        """
        Fit a biarc (two tangent-continuous arcs) between two points with given tangent directions.

        Returns tuple of (arc1, arc2) or None if fitting fails.
        """
        # Vector from start to end
        v = Point(p3.x - p0.x, p3.y - p0.y)
        v_len = math.sqrt(v.x**2 + v.y**2)

        if v_len < 1e-10:
            return None

        # Calculate the joint point parameter
        # Using the formula from "An Algorithm for Automatically Fitting Digitized Curves"

        # Cross products to determine arc directions
        cross0 = t0.x * v.y - t0.y * v.x  # t0 × v
        cross3 = t3.x * v.y - t3.y * v.x  # t3 × v
        cross_t = t0.x * t3.y - t0.y * t3.x  # t0 × t3

        # Dot products
        dot0 = t0.x * v.x + t0.y * v.y  # t0 · v
        dot3 = t3.x * v.x + t3.y * v.y  # t3 · v
        dot_t = t0.x * t3.x + t0.y * t3.y  # t0 · t3

        # Handle special cases
        if abs(cross_t) < 1e-10:
            # Tangents are parallel
            if abs(cross0) < 1e-10:
                # Both tangents parallel to v - use a single line
                return (PathSegment(is_arc=False, start=p0, end=p3), None)
            else:
                # Parallel but not to v - use single arc
                arc = self._fit_single_arc(p0, t0, p3, t3)
                if arc:
                    return (arc, None)
                return None

        # Calculate d (parameter for joint point position)
        # d = |v|² / (2 * (dot0 - dot3) / (1 - dot_t) + 2 * |v|)
        denom = 2 * v_len
        if abs(1 - dot_t) > 1e-10:
            denom += 2 * (dot0 - dot3) / (1 - dot_t)

        if abs(denom) < 1e-10:
            return None

        d = (v_len * v_len) / denom

        if d < 0:
            d = v_len / 2  # Fallback to midpoint

        # Joint point: pm = p0 + d * t0
        pm = Point(p0.x + d * t0.x, p0.y + d * t0.y)

        # Fit first arc from p0 to pm with tangent t0 at p0
        arc1 = self._arc_from_tangent(p0, t0, pm)

        # Fit second arc from pm to p3 with tangent t3 at p3
        arc2 = self._arc_from_tangent_end(pm, p3, t3)

        if arc1 is None or arc2 is None:
            # Try fitting a single arc instead
            arc = self._fit_single_arc(p0, t0, p3, t3)
            if arc:
                return (arc, None)
            return None

        return (arc1, arc2)

    def _fit_single_arc(self, p0: Point, t0: Point, p3: Point, t3: Point) -> Optional[PathSegment]:
        """Fit a single arc between two points with given tangents."""
        # The center must be on the perpendicular to t0 through p0
        # and on the perpendicular to t3 through p3

        # Perpendicular directions
        n0 = Point(-t0.y, t0.x)
        n3 = Point(-t3.y, t3.x)

        # Find intersection of the two perpendicular lines
        # p0 + s * n0 = p3 + t * n3
        # Solve for s
        denom = n0.x * n3.y - n0.y * n3.x

        if abs(denom) < 1e-10:
            # Lines are parallel - no single arc possible
            return None

        dx = p3.x - p0.x
        dy = p3.y - p0.y
        s = (dx * n3.y - dy * n3.x) / denom

        center = Point(p0.x + s * n0.x, p0.y + s * n0.y)
        radius = math.sqrt((center.x - p0.x)**2 + (center.y - p0.y)**2)

        if radius < 1e-10 or radius > 10000:
            return None

        # Determine direction (CW or CCW)
        # Check cross product of (p0 - center) × (p3 - center)
        v0 = Point(p0.x - center.x, p0.y - center.y)
        v3 = Point(p3.x - center.x, p3.y - center.y)
        cross = v0.x * v3.y - v0.y * v3.x
        clockwise = cross < 0

        return PathSegment(is_arc=True, start=p0, end=p3, center=center, radius=radius, clockwise=clockwise)

    def _arc_from_tangent(self, p0: Point, t0: Point, p1: Point) -> Optional[PathSegment]:
        """Create an arc from p0 to p1, with tangent t0 at p0."""
        # The center is on the line perpendicular to t0 through p0
        # and equidistant from p0 and p1

        n0 = Point(-t0.y, t0.x)  # Perpendicular to tangent

        # Midpoint of p0-p1
        mid = Point((p0.x + p1.x) / 2, (p0.y + p1.y) / 2)

        # Direction from p0 to p1
        d = Point(p1.x - p0.x, p1.y - p0.y)
        d_len = math.sqrt(d.x**2 + d.y**2)

        if d_len < 1e-10:
            return None

        # Perpendicular bisector direction
        perp = Point(-d.y / d_len, d.x / d_len)

        # Find intersection of: p0 + s * n0 = mid + t * perp
        denom = n0.x * perp.y - n0.y * perp.x

        if abs(denom) < 1e-10:
            # Lines parallel - arc degenerates to line
            return PathSegment(is_arc=False, start=p0, end=p1)

        dx = mid.x - p0.x
        dy = mid.y - p0.y
        s = (dx * perp.y - dy * perp.x) / denom

        center = Point(p0.x + s * n0.x, p0.y + s * n0.y)
        radius = math.sqrt((center.x - p0.x)**2 + (center.y - p0.y)**2)

        if radius < 1e-10 or radius > 10000:
            return PathSegment(is_arc=False, start=p0, end=p1)

        # Determine direction based on tangent
        # If rotating from (p0-center) in direction of t0 reaches (p1-center), it's CCW
        v0 = Point(p0.x - center.x, p0.y - center.y)
        v1 = Point(p1.x - center.x, p1.y - center.y)

        # Cross product of tangent and radius vector
        cross = t0.x * v0.y - t0.y * v0.x
        clockwise = cross > 0

        return PathSegment(is_arc=True, start=p0, end=p1, center=center, radius=radius, clockwise=clockwise)

    def _arc_from_tangent_end(self, p0: Point, p1: Point, t1: Point) -> Optional[PathSegment]:
        """Create an arc from p0 to p1, with tangent t1 at p1."""
        # Similar to _arc_from_tangent but tangent is at the end

        n1 = Point(-t1.y, t1.x)  # Perpendicular to tangent

        # Midpoint of p0-p1
        mid = Point((p0.x + p1.x) / 2, (p0.y + p1.y) / 2)

        # Direction from p0 to p1
        d = Point(p1.x - p0.x, p1.y - p0.y)
        d_len = math.sqrt(d.x**2 + d.y**2)

        if d_len < 1e-10:
            return None

        # Perpendicular bisector direction
        perp = Point(-d.y / d_len, d.x / d_len)

        # Find intersection of: p1 + s * n1 = mid + t * perp
        denom = n1.x * perp.y - n1.y * perp.x

        if abs(denom) < 1e-10:
            return PathSegment(is_arc=False, start=p0, end=p1)

        dx = mid.x - p1.x
        dy = mid.y - p1.y
        s = (dx * perp.y - dy * perp.x) / denom

        center = Point(p1.x + s * n1.x, p1.y + s * n1.y)
        radius = math.sqrt((center.x - p1.x)**2 + (center.y - p1.y)**2)

        if radius < 1e-10 or radius > 10000:
            return PathSegment(is_arc=False, start=p0, end=p1)

        # Determine direction based on tangent at end
        v0 = Point(p0.x - center.x, p0.y - center.y)
        v1 = Point(p1.x - center.x, p1.y - center.y)

        cross = t1.x * v1.y - t1.y * v1.x
        clockwise = cross < 0

        return PathSegment(is_arc=True, start=p0, end=p1, center=center, radius=radius, clockwise=clockwise)

    def _biarc_error(self, bezier: CubicBezier, arc1: PathSegment, arc2: Optional[PathSegment]) -> float:
        """Calculate maximum error between Bezier curve and biarc approximation."""
        max_error = 0.0

        # Sample points along the Bezier
        for i in range(11):
            t = i / 10.0
            bp = bezier.point(t)
            bezier_pt = Point(bp.real, bp.imag)

            # Find closest point on the arcs
            if arc2 is None:
                arc_pt = self._closest_point_on_segment(bezier_pt, arc1)
            else:
                # Determine which arc this t value corresponds to
                pt1 = self._closest_point_on_segment(bezier_pt, arc1)
                pt2 = self._closest_point_on_segment(bezier_pt, arc2)
                d1 = math.sqrt((bezier_pt.x - pt1.x)**2 + (bezier_pt.y - pt1.y)**2)
                d2 = math.sqrt((bezier_pt.x - pt2.x)**2 + (bezier_pt.y - pt2.y)**2)
                arc_pt = pt1 if d1 < d2 else pt2

            error = math.sqrt((bezier_pt.x - arc_pt.x)**2 + (bezier_pt.y - arc_pt.y)**2)
            max_error = max(max_error, error)

        return max_error

    def _closest_point_on_segment(self, pt: Point, seg: PathSegment) -> Point:
        """Find the closest point on a path segment to a given point."""
        if not seg.is_arc:
            # Line segment - project point onto line
            dx = seg.end.x - seg.start.x
            dy = seg.end.y - seg.start.y
            len_sq = dx*dx + dy*dy

            if len_sq < 1e-10:
                return seg.start

            t = max(0, min(1, ((pt.x - seg.start.x) * dx + (pt.y - seg.start.y) * dy) / len_sq))
            return Point(seg.start.x + t * dx, seg.start.y + t * dy)
        else:
            # Arc - find angle and clamp to arc range
            if seg.center is None:
                return seg.start

            # Angle from center to point
            angle = math.atan2(pt.y - seg.center.y, pt.x - seg.center.x)

            # Project onto circle at this angle
            return Point(
                seg.center.x + seg.radius * math.cos(angle),
                seg.center.y + seg.radius * math.sin(angle)
            )

    def _subdivide_bezier_to_arcs(self, bezier: CubicBezier, tolerance: float, depth: int = 0) -> list[PathSegment]:
        """Subdivide a Bezier curve and convert each half to arcs."""
        if depth > 10:  # Prevent infinite recursion
            # Fall back to line
            return [PathSegment(
                is_arc=False,
                start=Point(bezier.start.real, bezier.start.imag),
                end=Point(bezier.end.real, bezier.end.imag)
            )]

        # Split Bezier at t=0.5
        left, right = self._split_bezier(bezier, 0.5)

        # Recursively convert each half
        segments = []
        segments.extend(self.bezier_to_biarcs(left, tolerance))
        segments.extend(self.bezier_to_biarcs(right, tolerance))

        return segments

    def _split_bezier(self, bezier: CubicBezier, t: float) -> tuple[CubicBezier, CubicBezier]:
        """Split a cubic Bezier at parameter t using de Casteljau's algorithm."""
        p0 = bezier.start
        p1 = bezier.control1
        p2 = bezier.control2
        p3 = bezier.end

        # First level
        p01 = p0 + t * (p1 - p0)
        p12 = p1 + t * (p2 - p1)
        p23 = p2 + t * (p3 - p2)

        # Second level
        p012 = p01 + t * (p12 - p01)
        p123 = p12 + t * (p23 - p12)

        # Third level - the split point
        p0123 = p012 + t * (p123 - p012)

        left = CubicBezier(p0, p01, p012, p0123)
        right = CubicBezier(p0123, p123, p23, p3)

        return left, right

    def quadratic_to_biarcs(self, quad: QuadraticBezier, tolerance: float = 0.1) -> list[PathSegment]:
        """Convert a quadratic Bezier to biarcs by first converting to cubic."""
        # Convert quadratic to cubic Bezier
        p0 = quad.start
        p1 = quad.control
        p2 = quad.end

        # Cubic control points from quadratic
        c1 = p0 + (2/3) * (p1 - p0)
        c2 = p2 + (2/3) * (p1 - p2)

        cubic = CubicBezier(p0, c1, c2, p2)
        return self.bezier_to_biarcs(cubic, tolerance)

    def svg_arc_to_biarcs(self, arc: Arc, tolerance: float = 0.1) -> list[PathSegment]:
        """Convert an SVG arc to PathSegments (which are already arcs)."""
        # SVG arcs are already circular/elliptical arcs
        # For circular arcs, we can directly convert
        # For elliptical arcs, we may need to approximate with multiple circular arcs

        start = Point(arc.start.real, arc.start.imag)
        end = Point(arc.end.real, arc.end.imag)

        # Check if it's a circular arc (rx == ry)
        if abs(arc.radius.real - arc.radius.imag) < 1e-6:
            # Circular arc - convert directly
            radius = arc.radius.real

            # Calculate center
            # This is simplified - SVG arc center calculation is complex
            center = Point(arc.center.real, arc.center.imag)

            return [PathSegment(
                is_arc=True,
                start=start,
                end=end,
                center=center,
                radius=radius,
                clockwise=arc.sweep  # sweep flag indicates direction
            )]
        else:
            # Elliptical arc - sample and convert to line segments for now
            # A more sophisticated approach would approximate with multiple circular arcs
            segments = []
            prev = start
            for i in range(1, 11):
                t = i / 10.0
                pt = arc.point(t)
                curr = Point(pt.real, pt.imag)
                segments.append(PathSegment(is_arc=False, start=prev, end=curr))
                prev = curr
            return segments

    def detect_circle(self, path: Path) -> Optional[tuple[Point, float]]:
        """
        Detect if a path is a circle (composed of arc segments).

        Returns (center, radius) if it's a circle, None otherwise.
        """
        if len(path) == 0:
            return None

    def detect_ellipse(self, path: Path, tolerance: float = 0.01) -> Optional[tuple[Point, float, float]]:
        """
        Detect an axis-aligned ellipse represented as cubic Bezier segments.

        Returns (center, rx, ry) if it's an ellipse, None otherwise.
        """
        if len(path) == 0:
            return None

        # Only handle closed paths made entirely of cubic Beziers
        if not path.isclosed():
            return None
        if not all(isinstance(seg, CubicBezier) for seg in path):
            return None

        try:
            xmin, xmax, ymin, ymax = path.bbox()
        except Exception:
            return None

        rx = (xmax - xmin) / 2.0
        ry = (ymax - ymin) / 2.0
        if rx <= 0 or ry <= 0:
            return None

        cx = (xmin + xmax) / 2.0
        cy = (ymin + ymax) / 2.0

        # Check that sampled points satisfy the ellipse equation within tolerance
        # (x-cx)^2/rx^2 + (y-cy)^2/ry^2 ≈ 1
        for seg in path:
            for i in range(0, 21):
                t = i / 20.0
                pt = seg.point(t)
                if rx == 0 or ry == 0:
                    return None
                val = ((pt.real - cx) / rx) ** 2 + ((pt.imag - cy) / ry) ** 2
                if abs(val - 1.0) > tolerance:
                    return None

        return (Point(cx, cy), rx, ry)

        # Check if all segments are arcs
        if not all(isinstance(seg, Arc) for seg in path):
            return None

        # Check if the path is closed
        if not path.isclosed():
            return None

        # For a circle, all arcs should have the same radius and center
        first_arc = path[0]
        radius = first_arc.radius.real  # Arc radius (take real part for circles)

        # Calculate center from first arc
        # Arc center can be computed from start, end, radius, and rotation
        # For circles converted from SVG, the center is typically consistent
        try:
            # Get center by finding point equidistant from start and end
            # For a proper circle, we can compute center from any arc
            start = first_arc.start
            center = first_arc.center

            # Verify all arcs share approximately the same center and radius
            tolerance = 0.1  # mm tolerance
            for arc in path:
                arc_center = arc.center
                arc_radius = arc.radius.real
                if abs(arc_center.real - center.real) > tolerance:
                    return None
                if abs(arc_center.imag - center.imag) > tolerance:
                    return None
                if abs(arc_radius - radius) > tolerance:
                    return None

            return (Point(center.real, center.imag), radius)

        except Exception:
            return None

    def path_to_processed(self, path: Path, num_samples: int = 50, use_arcs: bool = True) -> ProcessedPath:
        """Convert an SVG path to a ProcessedPath with circle detection and arc approximation.

        Args:
            path: SVG path from svgpathtools
            num_samples: Number of samples for point-based representation
            use_arcs: If True, generate arc segments for G2/G3 output
        """
        points = self.path_to_points(path, num_samples)

        # Check if this path is a circle
        circle_info = self.detect_circle(path)

        if circle_info:
            center, radius = circle_info
            return ProcessedPath(
                points=points,
                is_circle=True,
                circle_center=center,
                circle_radius=radius
            )

        # Check if this path is an ellipse (axis-aligned)
        ellipse_info = self.detect_ellipse(path)
        if ellipse_info:
            center, rx, ry = ellipse_info
            return ProcessedPath(
                points=points,
                is_ellipse=True,
                ellipse_center=center,
                ellipse_rx=rx,
                ellipse_ry=ry
            )

        # Generate arc segments for non-circle paths
        segments = []
        if use_arcs:
            segments = self.path_to_segments(path, tolerance=0.1)
            # Generate points from segments for preview display
            points = self.segments_to_points(segments)

        return ProcessedPath(points=points, segments=segments)

    def segments_to_points(self, segments: list[PathSegment], samples_per_arc: int = 20) -> list[Point]:
        """Convert arc/line segments to points for preview display.

        Args:
            segments: List of PathSegment (arcs and lines)
            samples_per_arc: Number of points to sample along each arc

        Returns:
            List of points representing the path
        """
        points = []

        for seg in segments:
            # Add start point if not duplicate
            if not points or (abs(points[-1].x - seg.start.x) > 0.001 or
                             abs(points[-1].y - seg.start.y) > 0.001):
                points.append(seg.start)

            if seg.is_arc and seg.center is not None:
                # Arc segment - sample points along the arc
                start_angle = math.atan2(seg.start.y - seg.center.y, seg.start.x - seg.center.x)
                end_angle = math.atan2(seg.end.y - seg.center.y, seg.end.x - seg.center.x)

                # Calculate sweep angle
                if seg.clockwise:
                    sweep = start_angle - end_angle
                    if sweep <= 0:
                        sweep += 2 * math.pi
                else:
                    sweep = end_angle - start_angle
                    if sweep <= 0:
                        sweep += 2 * math.pi

                # Sample points along arc
                for i in range(1, samples_per_arc):
                    t = i / samples_per_arc
                    if seg.clockwise:
                        angle = start_angle - t * sweep
                    else:
                        angle = start_angle + t * sweep

                    x = seg.center.x + seg.radius * math.cos(angle)
                    y = seg.center.y + seg.radius * math.sin(angle)
                    points.append(Point(x, y))
            elif seg.is_bezier and seg.control1 is not None and seg.control2 is not None:
                # Bezier segment - sample along cubic
                for i in range(1, samples_per_arc):
                    t = i / samples_per_arc
                    mt = 1 - t
                    x = (mt ** 3) * seg.start.x + 3 * (mt ** 2) * t * seg.control1.x + \
                        3 * mt * (t ** 2) * seg.control2.x + (t ** 3) * seg.end.x
                    y = (mt ** 3) * seg.start.y + 3 * (mt ** 2) * t * seg.control1.y + \
                        3 * mt * (t ** 2) * seg.control2.y + (t ** 3) * seg.end.y
                    points.append(Point(x, y))

            # Add end point
            points.append(seg.end)

        return points

    def path_to_points(self, path: Path, num_samples: int = 100) -> list[Point]:
        """Convert an SVG path to a list of points, preserving segment endpoints (corners).

        For straight Line segments: only uses start and end points (no interior sampling).
        For curves (CubicBezier, QuadraticBezier, Arc): samples interior points for smoothness.
        """
        points = []
        if len(path) == 0:
            return points

        num_segments = len(path)
        samples_per_segment = max(2, num_samples // num_segments)

        for seg_idx, segment in enumerate(path):
            # Always add segment start point (this preserves corners exactly)
            try:
                start_pt = segment.point(0)
                # Avoid duplicate if this start == previous end
                if not points or (abs(points[-1].x - start_pt.real) > 0.001 or
                                   abs(points[-1].y - start_pt.imag) > 0.001):
                    points.append(Point(start_pt.real, start_pt.imag))
            except Exception:
                pass

            # For straight lines: only need the endpoint (start already added)
            # For curves: sample interior points for smooth rendering
            if isinstance(segment, Line):
                # Line segments: just add endpoint, no interior sampling needed
                try:
                    end_pt = segment.point(1)
                    points.append(Point(end_pt.real, end_pt.imag))
                except Exception:
                    pass
            else:
                # Curves (CubicBezier, QuadraticBezier, Arc): sample interior points
                # Use at least 10 samples per curve for smoothness
                curve_samples = max(10, samples_per_segment)
                for i in range(1, curve_samples):
                    t = i / curve_samples
                    try:
                        pt = segment.point(t)
                        points.append(Point(pt.real, pt.imag))
                    except Exception:
                        continue
                # Add endpoint
                try:
                    end_pt = segment.point(1)
                    points.append(Point(end_pt.real, end_pt.imag))
                except Exception:
                    pass

        return points

    def path_to_segments(self, path: Path, tolerance: float = 0.1) -> list[PathSegment]:
        """Convert an SVG path to a list of arc/line segments for G2/G3 output.

        Uses biarc approximation to convert Bezier curves to circular arcs.

        Args:
            path: SVG path from svgpathtools
            tolerance: Maximum deviation from true curve (in SVG units)

        Returns:
            List of PathSegment objects (arcs and lines)
        """
        segments = []
        if len(path) == 0:
            return segments

        for segment in path:
            if isinstance(segment, Line):
                # Straight line - direct conversion
                start = Point(segment.start.real, segment.start.imag)
                end = Point(segment.end.real, segment.end.imag)
                segments.append(PathSegment(is_arc=False, start=start, end=end))

            elif isinstance(segment, CubicBezier):
                # Preserve cubic Bezier for G5 output
                start = Point(segment.start.real, segment.start.imag)
                end = Point(segment.end.real, segment.end.imag)
                c1 = Point(segment.control1.real, segment.control1.imag)
                c2 = Point(segment.control2.real, segment.control2.imag)
                segments.append(PathSegment(
                    is_arc=False,
                    is_bezier=True,
                    start=start,
                    end=end,
                    control1=c1,
                    control2=c2
                ))

            elif isinstance(segment, QuadraticBezier):
                # Convert quadratic to cubic control points, preserve as Bezier
                p0 = segment.start
                p1 = segment.control
                p2 = segment.end
                c1 = p0 + (2/3) * (p1 - p0)
                c2 = p2 + (2/3) * (p1 - p2)
                start = Point(p0.real, p0.imag)
                end = Point(p2.real, p2.imag)
                segments.append(PathSegment(
                    is_arc=False,
                    is_bezier=True,
                    start=start,
                    end=end,
                    control1=Point(c1.real, c1.imag),
                    control2=Point(c2.real, c2.imag)
                ))

            elif isinstance(segment, Arc):
                # SVG Arc - convert directly
                arcs = self.svg_arc_to_biarcs(segment, tolerance)
                segments.extend(arcs)

            else:
                # Unknown segment type - sample as points and use lines
                try:
                    start = Point(segment.point(0).real, segment.point(0).imag)
                    end = Point(segment.point(1).real, segment.point(1).imag)
                    segments.append(PathSegment(is_arc=False, start=start, end=end))
                except Exception:
                    pass

        return segments

    def simplify_points(self, points: list[Point], tolerance: float = 0.5) -> list[Point]:
        """Simplify points using Ramer-Douglas-Peucker algorithm with corner preservation."""
        if len(points) < 3:
            return points

        try:
            # Convert to numpy array
            coords = np.array([[p.x, p.y] for p in points])

            # Detect sharp corners (angle < 135 degrees) and mark them for preservation
            corner_indices = self._detect_corners(coords, angle_threshold=135)

            # RDP simplification
            simplified = self._rdp_preserve_corners(coords, tolerance, corner_indices)

            return [Point(p[0], p[1]) for p in simplified]
        except Exception as e:
            print(f"[WARNING] Simplification failed for path with {len(points)} points: {e}. Using original points.")
            return points

    def _detect_corners(self, points: np.ndarray, angle_threshold: float = 135) -> set:
        """Detect sharp corners in a point sequence."""
        corners = set()
        if len(points) < 3:
            return corners

        for i in range(1, len(points) - 1):
            # Calculate vectors
            v1 = points[i] - points[i-1]
            v2 = points[i+1] - points[i]

            # Calculate angle between vectors
            len1 = np.linalg.norm(v1)
            len2 = np.linalg.norm(v2)

            if len1 > 0.001 and len2 > 0.001:
                cos_angle = np.dot(v1, v2) / (len1 * len2)
                cos_angle = np.clip(cos_angle, -1, 1)
                angle = np.degrees(np.arccos(cos_angle))

                # If angle is sharp (less than threshold), mark as corner
                if angle < angle_threshold:
                    corners.add(i)

        return corners

    def _rdp_preserve_corners(self, points: np.ndarray, epsilon: float, corners: set,
                               start_idx: int = 0) -> np.ndarray:
        """RDP with corner preservation - iterative implementation."""
        if len(points) < 3:
            return points

        n = len(points)
        # Track which indices to keep (always keep first and last)
        keep = set([0, n - 1])
        # Also keep all corner points
        for c in corners:
            local_idx = c - start_idx
            if 0 <= local_idx < n:
                keep.add(local_idx)

        # Stack of segments to process: (local_start_idx, local_end_idx)
        stack = [(0, n - 1)]

        while stack:
            seg_start, seg_end = stack.pop()

            if seg_end - seg_start < 2:
                continue

            segment = points[seg_start:seg_end + 1]
            start_pt, end_pt = segment[0], segment[-1]
            line_vec = end_pt - start_pt
            line_len = np.linalg.norm(line_vec)

            # Find split point
            split_idx = None

            if line_len == 0:
                # Closed path - find point furthest from start
                distances = np.linalg.norm(segment - start_pt, axis=1)
                local_max = np.argmax(distances)
                if distances[local_max] > epsilon and local_max > 0 and local_max < len(segment) - 1:
                    split_idx = seg_start + local_max
            else:
                line_unit = line_vec / line_len
                vec_to_points = segment - start_pt
                proj_lengths = np.dot(vec_to_points, line_unit)
                proj_points = start_pt + np.outer(proj_lengths, line_unit)
                distances = np.linalg.norm(segment - proj_points, axis=1)

                # Check for corners in this segment first
                for i in range(1, len(segment) - 1):
                    global_idx = start_idx + seg_start + i
                    if global_idx in corners:
                        split_idx = seg_start + i
                        break

                # If no corner, check max distance
                if split_idx is None:
                    local_max = np.argmax(distances)
                    if distances[local_max] > epsilon and local_max > 0 and local_max < len(segment) - 1:
                        split_idx = seg_start + local_max

            if split_idx is not None:
                keep.add(split_idx)
                # Process both halves
                stack.append((seg_start, split_idx))
                stack.append((split_idx, seg_end))

        # Return points at kept indices, sorted
        kept_indices = sorted(keep)
        return points[kept_indices]

    def _rdp(self, points: np.ndarray, epsilon: float) -> np.ndarray:
        """Ramer-Douglas-Peucker line simplification - iterative implementation."""
        if len(points) < 3:
            return points

        n = len(points)
        # Track which indices to keep (always keep first and last)
        keep = set([0, n - 1])

        # Stack of segments to process: (start_idx, end_idx)
        stack = [(0, n - 1)]

        while stack:
            seg_start, seg_end = stack.pop()

            if seg_end - seg_start < 2:
                continue

            segment = points[seg_start:seg_end + 1]
            start_pt, end_pt = segment[0], segment[-1]
            line_vec = end_pt - start_pt
            line_len = np.linalg.norm(line_vec)

            split_idx = None

            if line_len == 0:
                # Closed path - find point furthest from start
                distances = np.linalg.norm(segment - start_pt, axis=1)
                local_max = np.argmax(distances)
                if distances[local_max] > epsilon and local_max > 0 and local_max < len(segment) - 1:
                    split_idx = seg_start + local_max
            else:
                line_unit = line_vec / line_len
                vec_to_points = segment - start_pt
                proj_lengths = np.dot(vec_to_points, line_unit)
                proj_points = start_pt + np.outer(proj_lengths, line_unit)
                distances = np.linalg.norm(segment - proj_points, axis=1)

                local_max = np.argmax(distances)
                if distances[local_max] > epsilon and local_max > 0 and local_max < len(segment) - 1:
                    split_idx = seg_start + local_max

            if split_idx is not None:
                keep.add(split_idx)
                # Process both halves
                stack.append((seg_start, split_idx))
                stack.append((split_idx, seg_end))

        # Return points at kept indices, sorted
        kept_indices = sorted(keep)
        return points[kept_indices]

    def scale_and_position(self, all_points: list[list[Point]],
                            margin: float = 0.0,
                            alignment: str = "center",
                            offset_x: float = 0.0,
                            offset_y: float = 0.0,
                            scale_mode: str = "fit",
                            scale_value: float = 100.0,
                            target_width: float = 0.0,
                            target_height: float = 0.0,
                            svg_width: Optional[float] = None,
                            svg_height: Optional[float] = None,
                            svg_min_x: float = 0,
                            svg_min_y: float = 0,
                            container_width: Optional[float] = None,
                            container_height: Optional[float] = None) -> tuple[list[list[Point]], dict]:
        """
        Scale and position paths on the plotter bed.

        Args:
            all_points: List of path points
            margin: Margin from bed edges when using alignment
            alignment: One of "center", "top-left", "top", "top-right", "left", "right", "bottom-left", "bottom", "bottom-right", "custom"
            offset_x: Manual X offset (only used when alignment="custom")
            offset_y: Manual Y offset (only used when alignment="custom")
            scale_mode: One of "fit", "original", "percent", "width", "height"
            scale_value: Scale percentage (used when scale_mode="percent")
            target_width: Target width in mm (used when scale_mode="width")
            target_height: Target height in mm (used when scale_mode="height")
            svg_width: Optional SVG canvas width (from viewBox or width attribute)
            svg_height: Optional SVG canvas height (from viewBox or height attribute)

        Returns:
            Tuple of (transformed_points, dimensions_dict)
        """
        if not all_points or not any(all_points):
            return all_points, {"width": 0, "height": 0, "scale": 1.0}

        # Find artwork bounds
        all_x = [p.x for points in all_points for p in points]
        all_y = [p.y for points in all_points for p in points]

        if not all_x or not all_y:
            return all_points, {"width": 0, "height": 0, "scale": 1.0}

        art_min_x, art_max_x = min(all_x), max(all_x)
        art_min_y, art_max_y = min(all_y), max(all_y)

        # Use SVG dimensions if provided, otherwise use artwork bounds
        # This ensures a small circle in a large SVG respects the canvas size
        if svg_width is not None and svg_height is not None and svg_width > 0 and svg_height > 0:
            # Use SVG canvas dimensions for scaling
            min_x, min_y = svg_min_x, svg_min_y
            canvas_width = svg_width
            canvas_height = svg_height
        else:
            # Fall back to artwork bounds
            min_x, min_y = art_min_x, art_min_y
            canvas_width = art_max_x - art_min_x
            canvas_height = art_max_y - art_min_y

        if canvas_width == 0 or canvas_height == 0:
            return all_points, {"width": 0, "height": 0, "scale": 1.0}

        # Use container dimensions if provided (artboard), otherwise use bed dimensions
        effective_width = container_width if container_width is not None else self.profile.bed_width
        effective_height = container_height if container_height is not None else self.profile.bed_height

        # Calculate scale based on mode
        bed_width = effective_width - 2 * margin
        bed_height = effective_height - 2 * margin

        if scale_mode == "fit":
            # Scale to fit bed while maintaining aspect ratio
            scale = min(bed_width / canvas_width, bed_height / canvas_height)
        elif scale_mode == "original":
            # Keep original size (assume SVG units are in some reasonable scale)
            # SVG coordinates are often in pixels at 96 DPI, convert to mm
            # 1 inch = 25.4mm, 96 pixels = 1 inch
            scale = 25.4 / 96.0  # ~0.265 mm per pixel
        elif scale_mode == "percent":
            # Scale by percentage relative to fit size
            fit_scale = min(bed_width / canvas_width, bed_height / canvas_height)
            scale = fit_scale * (scale_value / 100.0)
        elif scale_mode == "width":
            # Scale to target width
            if target_width > 0:
                scale = target_width / canvas_width
            else:
                scale = min(bed_width / canvas_width, bed_height / canvas_height)
        elif scale_mode == "height":
            # Scale to target height
            if target_height > 0:
                scale = target_height / canvas_height
            else:
                scale = min(bed_width / canvas_width, bed_height / canvas_height)
        else:
            # Default to fit
            scale = min(bed_width / canvas_width, bed_height / canvas_height)

        # Calculate scaled dimensions
        scaled_width = canvas_width * scale
        scaled_height = canvas_height * scale

        # Calculate offset based on alignment
        # Note: Plotter uses Cartesian coordinates (Y=0 at bottom, Y increases upward)
        # So "top" means high Y values, "bottom" means low Y values
        if alignment == "center":
            final_offset_x = (effective_width - scaled_width) / 2
            final_offset_y = (effective_height - scaled_height) / 2
        elif alignment == "top-left":
            final_offset_x = margin
            final_offset_y = effective_height - margin - scaled_height  # High Y = top
        elif alignment == "top-right":
            final_offset_x = effective_width - margin - scaled_width
            final_offset_y = effective_height - margin - scaled_height  # High Y = top
        elif alignment == "bottom-left":
            final_offset_x = margin
            final_offset_y = margin  # Low Y = bottom
        elif alignment == "bottom-right":
            final_offset_x = effective_width - margin - scaled_width
            final_offset_y = margin  # Low Y = bottom
        elif alignment == "top":
            final_offset_x = (effective_width - scaled_width) / 2
            final_offset_y = effective_height - margin - scaled_height  # High Y = top
        elif alignment == "bottom":
            final_offset_x = (effective_width - scaled_width) / 2
            final_offset_y = margin  # Low Y = bottom
        elif alignment == "left":
            final_offset_x = margin
            final_offset_y = (effective_height - scaled_height) / 2
        elif alignment == "right":
            final_offset_x = effective_width - margin - scaled_width
            final_offset_y = (effective_height - scaled_height) / 2
        elif alignment == "custom":
            final_offset_x = offset_x
            final_offset_y = offset_y
        else:
            # Default to center
            final_offset_x = (effective_width - scaled_width) / 2
            final_offset_y = (effective_height - scaled_height) / 2

        # Transform points
        # Note: SVG Y-axis increases downward, plotter Y-axis increases upward
        # So we flip Y: new_y = scaled_height - (normalized_y) + offset
        result = []
        for points in all_points:
            transformed = []
            for p in points:
                new_x = (p.x - min_x) * scale + final_offset_x
                # Flip Y to convert from SVG coordinates to plotter coordinates
                new_y = scaled_height - (p.y - min_y) * scale + final_offset_y
                transformed.append(Point(new_x, new_y))
            result.append(transformed)

        dimensions = {
            "width": scaled_width,
            "height": scaled_height,
            "scale": scale,
            "original_width": canvas_width,
            "original_height": canvas_height,
            "offset_x": final_offset_x,
            "offset_y": final_offset_y,
        }

        return result, dimensions

    # Keep old method for backwards compatibility
    def scale_and_center(self, all_points: list[list[Point]], margin: float = 10.0) -> list[list[Point]]:
        """Scale and center paths to fit the plotter bed. (Legacy method)"""
        result, _ = self.scale_and_position(all_points, margin=margin, alignment="center")
        return result

    def sort_paths(self, all_points: list[list[Point]]) -> list[list[Point]]:
        """Sort paths to minimize travel distance (greedy nearest neighbor)."""
        if len(all_points) <= 1:
            return all_points

        result = []
        remaining = list(range(len(all_points)))
        current_pos = Point(0, 0)

        while remaining:
            # Find nearest path start
            min_dist = float('inf')
            nearest_idx = 0

            for i, idx in enumerate(remaining):
                if all_points[idx]:
                    start = all_points[idx][0]
                    dist = (start.x - current_pos.x) ** 2 + (start.y - current_pos.y) ** 2
                    if dist < min_dist:
                        min_dist = dist
                        nearest_idx = i

            # Add this path
            path_idx = remaining.pop(nearest_idx)
            path = all_points[path_idx]
            result.append(path)

            if path:
                current_pos = path[-1]

        return result

    def sort_paths_greedy_flip(self, all_points: list[list[Point]]) -> list[list[Point]]:
        """Greedy nearest neighbor with path direction optimization."""
        if len(all_points) <= 1:
            return all_points

        result = []
        remaining = list(range(len(all_points)))
        current_pos = Point(0, 0)

        while remaining:
            min_dist = float('inf')
            nearest_idx = 0
            should_flip = False

            for i, idx in enumerate(remaining):
                path = all_points[idx]
                if not path:
                    continue

                # Check distance to path start
                start = path[0]
                dist_to_start = (start.x - current_pos.x) ** 2 + (start.y - current_pos.y) ** 2

                # Check distance to path end (would require flipping)
                end = path[-1]
                dist_to_end = (end.x - current_pos.x) ** 2 + (end.y - current_pos.y) ** 2

                if dist_to_start < min_dist:
                    min_dist = dist_to_start
                    nearest_idx = i
                    should_flip = False
                if dist_to_end < min_dist:
                    min_dist = dist_to_end
                    nearest_idx = i
                    should_flip = True

            path_idx = remaining.pop(nearest_idx)
            path = all_points[path_idx]

            if should_flip:
                path = list(reversed(path))

            result.append(path)
            if path:
                current_pos = path[-1]

        return result

    def optimize_paths(self, all_points: list[list[Point]],
                       method: str = "greedy") -> list[list[Point]]:
        """Apply specified optimization method to paths."""
        print(f"[DEBUG] optimize_paths called with method='{method}', num_paths={len(all_points)}")

        # Log first point of each path before optimization
        for i, path in enumerate(all_points[:5]):  # First 5 paths
            if path:
                print(f"[DEBUG] Before - Path {i}: starts at ({path[0].x:.1f}, {path[0].y:.1f})")

        if method == "none":
            print(f"[DEBUG] Returning original order")
            return all_points
        elif method == "greedy":
            result = self.sort_paths(all_points)
            # Log first point of each path after optimization
            for i, path in enumerate(result[:5]):
                if path:
                    print(f"[DEBUG] After greedy - Path {i}: starts at ({path[0].x:.1f}, {path[0].y:.1f})")
            return result
        elif method == "greedy_flip":
            result = self.sort_paths_greedy_flip(all_points)
            for i, path in enumerate(result[:5]):
                if path:
                    print(f"[DEBUG] After greedy_flip - Path {i}: starts at ({path[0].x:.1f}, {path[0].y:.1f})")
            return result
        else:
            return self.sort_paths(all_points)  # Default fallback

    def to_gcode(self, all_paths: list[ProcessedPath]) -> str:
        """Convert processed paths to G-code, using G2/G3 for circles."""
        coord_precision = 4  # Avoid rounding tiny arcs into full circles
        max_arc_seconds = 2.0  # Split/approximate long arcs to avoid long blocking moves

        def fmt_coord(value: float) -> str:
            return f"{value:.{coord_precision}f}"

        def fmt_feed(value: float) -> str:
            return f"{value:.0f}"

        def rounded(value: float) -> float:
            return round(value, coord_precision)

        def same_point(a: Point, b: Point) -> bool:
            return rounded(a.x) == rounded(b.x) and rounded(a.y) == rounded(b.y)

        def arc_sweep(seg: PathSegment) -> float:
            if seg.center is None:
                return 0.0
            start_angle = math.atan2(seg.start.y - seg.center.y, seg.start.x - seg.center.x)
            end_angle = math.atan2(seg.end.y - seg.center.y, seg.end.x - seg.center.x)
            if seg.clockwise:
                sweep = start_angle - end_angle
                if sweep <= 0:
                    sweep += 2 * math.pi
            else:
                sweep = end_angle - start_angle
                if sweep <= 0:
                    sweep += 2 * math.pi
            return sweep

        def arc_to_polyline(seg: PathSegment, max_step_mm: float = 0.5) -> list[Point]:
            """Approximate an arc with line segments (returns points excluding start)."""
            if seg.center is None or seg.radius <= 0:
                return [seg.end]

            start_angle = math.atan2(seg.start.y - seg.center.y, seg.start.x - seg.center.x)
            sweep = arc_sweep(seg)
            arc_length = abs(seg.radius * sweep)
            num_segments = max(1, int(arc_length / max_step_mm))
            num_segments = min(num_segments, 1000)

            points: list[Point] = []
            for i in range(1, num_segments + 1):
                t = i / num_segments
                angle = (start_angle - t * sweep) if seg.clockwise else (start_angle + t * sweep)
                x = seg.center.x + seg.radius * math.cos(angle)
                y = seg.center.y + seg.radius * math.sin(angle)
                points.append(Point(x, y))
            return points

        lines = [
            "; Pen Plotter G-code",
            f"; Generated by penplotgui",
            f"; Profile: {self.profile.name}",
            f"; Bed size: {self.profile.bed_width}x{self.profile.bed_height}mm",
            "",
            "G90 ; Absolute positioning",
            "G28 ; Home axes",
            "M5  ; Pen up",
            "",
        ]

        for processed_path in all_paths:
            path_points = processed_path.points
            if len(path_points) < 2:
                continue

            # Move to start (pen up)
            start = path_points[0]
            lines.append(f"G0 X{fmt_coord(start.x)} Y{fmt_coord(start.y)} F{fmt_feed(self.profile.rapid_feed_rate)}")

            # Pen down
            lines.append("M3")

            if processed_path.is_circle and processed_path.circle_center:
                # Use G2/G3 for circle - draw as two semicircles
                center = processed_path.circle_center
                radius = processed_path.circle_radius

                # I and J are offsets from current position to center
                i_offset = center.x - start.x
                j_offset = center.y - start.y

                # Calculate the point on the opposite side of the circle
                # (180 degrees from start)
                opposite_x = 2 * center.x - start.x
                opposite_y = 2 * center.y - start.y

                # First semicircle (clockwise G2)
                lines.append(f"; Circle: center=({center.x:.2f},{center.y:.2f}) r={radius:.2f}")
                lines.append(
                    f"G2 X{fmt_coord(opposite_x)} Y{fmt_coord(opposite_y)} "
                    f"I{fmt_coord(i_offset)} J{fmt_coord(j_offset)} F{fmt_feed(self.profile.draw_feed_rate)}"
                )

                # Second semicircle back to start
                i_offset2 = center.x - opposite_x
                j_offset2 = center.y - opposite_y
                lines.append(
                    f"G2 X{fmt_coord(start.x)} Y{fmt_coord(start.y)} "
                    f"I{fmt_coord(i_offset2)} J{fmt_coord(j_offset2)} F{fmt_feed(self.profile.draw_feed_rate)}"
                )

            elif processed_path.is_ellipse and processed_path.ellipse_center:
                # Use custom ellipse command (G6) for a full ellipse
                center = processed_path.ellipse_center
                lines.append(
                    f"G6 X{fmt_coord(center.x)} Y{fmt_coord(center.y)} "
                    f"I{fmt_coord(processed_path.ellipse_rx)} J{fmt_coord(processed_path.ellipse_ry)} "
                    f"F{fmt_feed(self.profile.draw_feed_rate)}"
                )
            elif processed_path.segments:
                # Use arc-aware segments (G2/G3 for arcs, G1 for lines)
                for seg in processed_path.segments:
                    if seg.is_bezier and seg.control1 is not None and seg.control2 is not None:
                        # Bezier segment - use G5
                        i_offset = seg.control1.x - seg.start.x
                        j_offset = seg.control1.y - seg.start.y
                        p_offset = seg.control2.x - seg.start.x
                        q_offset = seg.control2.y - seg.start.y
                        lines.append(
                            f"G5 X{fmt_coord(seg.end.x)} Y{fmt_coord(seg.end.y)} "
                            f"I{fmt_coord(i_offset)} J{fmt_coord(j_offset)} "
                            f"P{fmt_coord(p_offset)} Q{fmt_coord(q_offset)} "
                            f"F{fmt_feed(self.profile.draw_feed_rate)}"
                        )
                        continue

                    if seg.is_arc and seg.center is not None and seg.radius is not None:
                        # Skip arcs with radius > 500mm — they're effectively straight
                        # lines and cause firmware hangs due to float precision issues
                        arc_too_large = seg.radius > 500
                        arc_center_outside = (
                            seg.center.x < 0.0 or seg.center.x > self.profile.bed_width or
                            seg.center.y < 0.0 or seg.center.y > self.profile.bed_height
                        )
                        arc_degenerate = same_point(seg.start, seg.end)
                        arc_len = abs(seg.radius * arc_sweep(seg))
                        mm_per_sec = max(1e-6, self.profile.draw_feed_rate / 60.0)
                        arc_seconds = arc_len / mm_per_sec if mm_per_sec > 0 else 0.0
                        arc_too_long = arc_seconds > max_arc_seconds

                        if not arc_too_large and not arc_center_outside and not arc_degenerate and not arc_too_long:
                            # Arc segment - use G2 (CW) or G3 (CCW)
                            i_offset = seg.center.x - seg.start.x
                            j_offset = seg.center.y - seg.start.y
                            cmd = "G2" if seg.clockwise else "G3"
                            lines.append(
                                f"{cmd} X{fmt_coord(seg.end.x)} Y{fmt_coord(seg.end.y)} "
                                f"I{fmt_coord(i_offset)} J{fmt_coord(j_offset)} F{fmt_feed(self.profile.draw_feed_rate)}"
                            )
                            continue

                        # Unsafe arc - fall back to polyline approximation
                        for pt in arc_to_polyline(seg):
                            if same_point(seg.start, pt):
                                continue
                            lines.append(f"G1 X{fmt_coord(pt.x)} Y{fmt_coord(pt.y)} F{fmt_feed(self.profile.draw_feed_rate)}")
                    else:
                        # Line segment - use G1
                        if same_point(seg.start, seg.end):
                            continue
                        lines.append(f"G1 X{fmt_coord(seg.end.x)} Y{fmt_coord(seg.end.y)} F{fmt_feed(self.profile.draw_feed_rate)}")
            else:
                # Fallback: regular path - use G1 line segments
                for point in path_points[1:]:
                    lines.append(f"G1 X{fmt_coord(point.x)} Y{fmt_coord(point.y)} F{fmt_feed(self.profile.draw_feed_rate)}")

            # Pen up
            lines.append("M5")

        # End sequence
        lines.extend([
            "",
            "; End of job",
            "M5  ; Pen up",
            f"G0 X0 Y0 F{fmt_feed(self.profile.rapid_feed_rate)} ; Return home",
        ])

        return "\n".join(lines)

    def to_gcode_points(self, all_points: list[list[Point]]) -> str:
        """Convert points to G-code (legacy, non-arc version)."""
        # Convert to ProcessedPath for compatibility
        processed = [ProcessedPath(points=pts) for pts in all_points]
        return self.to_gcode(processed)

    def scale_processed_paths(self, processed_paths: list[ProcessedPath],
                               margin: float = 0.0,
                               alignment: str = "center",
                               offset_x: float = 0.0,
                               offset_y: float = 0.0,
                               scale_mode: str = "fit",
                               scale_value: float = 100.0,
                               target_width: float = 0.0,
                               target_height: float = 0.0,
                               svg_width: Optional[float] = None,
                               svg_height: Optional[float] = None,
                               svg_min_x: float = 0,
                               svg_min_y: float = 0,
                               container_width: Optional[float] = None,
                               container_height: Optional[float] = None) -> tuple[list[ProcessedPath], dict]:
        """Scale and position processed paths, including circle centers."""
        # Extract all points for bounds calculation
        all_points = [pp.points for pp in processed_paths]

        # Use existing scale_and_position for points
        scaled_points, dimensions = self.scale_and_position(
            all_points, margin=margin, alignment=alignment,
            offset_x=offset_x, offset_y=offset_y,
            scale_mode=scale_mode, scale_value=scale_value,
            target_width=target_width, target_height=target_height,
            svg_width=svg_width, svg_height=svg_height,
            svg_min_x=svg_min_x, svg_min_y=svg_min_y,
            container_width=container_width, container_height=container_height
        )

        if not dimensions or dimensions.get("scale", 0) == 0:
            return processed_paths, dimensions

        scale = dimensions["scale"]

        # Find original bounds for transform calculation
        flat_points = [p for pts in all_points for p in pts]
        if not flat_points:
            return processed_paths, dimensions

        # Use SVG viewBox origin if SVG dimensions are provided, else use artwork bounds
        if svg_width is not None and svg_height is not None and svg_width > 0 and svg_height > 0:
            min_x = svg_min_x
            min_y = svg_min_y
        else:
            min_x = min(p.x for p in flat_points)
            min_y = min(p.y for p in flat_points)

        # Calculate offset from dimensions
        svg_width = dimensions.get("original_width", 0)
        svg_height = dimensions.get("original_height", 0)
        scaled_width = dimensions.get("width", 0)
        scaled_height = dimensions.get("height", 0)

        # Use container dimensions if provided (artboard), otherwise use bed dimensions
        effective_width = container_width if container_width is not None else self.profile.bed_width
        effective_height = container_height if container_height is not None else self.profile.bed_height

        # Recalculate final offset based on alignment (same logic as scale_and_position)
        # Note: Plotter uses Cartesian coordinates (Y=0 at bottom, Y increases upward)
        if alignment == "center":
            final_offset_x = (effective_width - scaled_width) / 2
            final_offset_y = (effective_height - scaled_height) / 2
        elif alignment == "top-left":
            final_offset_x = margin
            final_offset_y = effective_height - margin - scaled_height
        elif alignment == "top-right":
            final_offset_x = effective_width - margin - scaled_width
            final_offset_y = effective_height - margin - scaled_height
        elif alignment == "bottom-left":
            final_offset_x = margin
            final_offset_y = margin
        elif alignment == "bottom-right":
            final_offset_x = effective_width - margin - scaled_width
            final_offset_y = margin
        elif alignment == "top":
            final_offset_x = (effective_width - scaled_width) / 2
            final_offset_y = effective_height - margin - scaled_height
        elif alignment == "bottom":
            final_offset_x = (effective_width - scaled_width) / 2
            final_offset_y = margin
        elif alignment == "left":
            final_offset_x = margin
            final_offset_y = (effective_height - scaled_height) / 2
        elif alignment == "right":
            final_offset_x = effective_width - margin - scaled_width
            final_offset_y = (effective_height - scaled_height) / 2
        elif alignment == "custom":
            final_offset_x = offset_x
            final_offset_y = offset_y
        else:
            final_offset_x = (effective_width - scaled_width) / 2
            final_offset_y = (effective_height - scaled_height) / 2

        # Helper function to transform a point
        def transform_point(p: Point) -> Point:
            new_x = (p.x - min_x) * scale + final_offset_x
            new_y = scaled_height - (p.y - min_y) * scale + final_offset_y
            return Point(new_x, new_y)

        # Create new processed paths with scaled data
        result = []
        for i, pp in enumerate(processed_paths):
            # Scale segments if present
            new_segments = []
            for seg in pp.segments:
                new_seg = PathSegment(
                    is_arc=seg.is_arc,
                    start=transform_point(seg.start),
                    end=transform_point(seg.end),
                    center=transform_point(seg.center) if seg.center else None,
                    radius=seg.radius * scale if seg.is_arc else 0,
                    clockwise=not seg.clockwise,  # Y-axis flip reverses winding direction
                    is_bezier=seg.is_bezier,
                    control1=transform_point(seg.control1) if seg.control1 else None,
                    control2=transform_point(seg.control2) if seg.control2 else None
                )
                new_segments.append(new_seg)

            new_pp = ProcessedPath(
                points=scaled_points[i],
                segments=new_segments,
                is_circle=pp.is_circle,
                is_ellipse=pp.is_ellipse
            )

            # Scale circle center and radius if present
            if pp.is_circle and pp.circle_center:
                new_pp.circle_center = transform_point(pp.circle_center)
                new_pp.circle_radius = pp.circle_radius * scale

            # Scale ellipse center and radii if present
            if pp.is_ellipse and pp.ellipse_center:
                new_pp.ellipse_center = transform_point(pp.ellipse_center)
                new_pp.ellipse_rx = pp.ellipse_rx * scale
                new_pp.ellipse_ry = pp.ellipse_ry * scale

            result.append(new_pp)

        return result, dimensions

    def _reverse_processed_path(self, pp: ProcessedPath) -> ProcessedPath:
        """Return a copy of ProcessedPath with reversed direction."""
        reversed_points = list(reversed(pp.points))

        reversed_segments: list[PathSegment] = []
        if pp.segments:
            for seg in reversed(pp.segments):
                if seg.is_arc and seg.center is not None:
                    reversed_segments.append(PathSegment(
                        is_arc=True,
                        start=seg.end,
                        end=seg.start,
                        center=seg.center,
                        radius=seg.radius,
                        clockwise=not seg.clockwise
                    ))
                elif seg.is_bezier and seg.control1 is not None and seg.control2 is not None:
                    reversed_segments.append(PathSegment(
                        is_arc=False,
                        is_bezier=True,
                        start=seg.end,
                        end=seg.start,
                        control1=seg.control2,
                        control2=seg.control1
                    ))
                else:
                    reversed_segments.append(PathSegment(
                        is_arc=False,
                        start=seg.end,
                        end=seg.start
                    ))

        new_pp = ProcessedPath(
            points=reversed_points,
            segments=reversed_segments,
            is_circle=pp.is_circle,
            arc_info=pp.arc_info,
            circle_center=pp.circle_center,
            circle_radius=pp.circle_radius,
            is_ellipse=pp.is_ellipse,
            ellipse_center=pp.ellipse_center,
            ellipse_rx=pp.ellipse_rx,
            ellipse_ry=pp.ellipse_ry
        )
        return new_pp

    def sort_processed_paths(self, paths: list[ProcessedPath],
                             method: str = "greedy") -> list[ProcessedPath]:
        """Sort processed paths to minimize travel distance.

        Supports method='greedy' and 'greedy_flip'.
        """
        if len(paths) <= 1:
            return paths

        if method not in ("greedy", "greedy_flip"):
            method = "greedy"

        result: list[ProcessedPath] = []
        remaining = list(range(len(paths)))
        current_pos = Point(0, 0)

        while remaining:
            min_dist = float('inf')
            nearest_idx = 0
            should_flip = False

            for i, idx in enumerate(remaining):
                pp = paths[idx]
                if not pp.points:
                    continue

                start = pp.points[0]
                dist_to_start = (start.x - current_pos.x) ** 2 + (start.y - current_pos.y) ** 2

                if dist_to_start < min_dist:
                    min_dist = dist_to_start
                    nearest_idx = i
                    should_flip = False

                if method == "greedy_flip":
                    end = pp.points[-1]
                    dist_to_end = (end.x - current_pos.x) ** 2 + (end.y - current_pos.y) ** 2
                    if dist_to_end < min_dist:
                        min_dist = dist_to_end
                        nearest_idx = i
                        should_flip = True

            path_idx = remaining.pop(nearest_idx)
            path = paths[path_idx]
            if should_flip:
                path = self._reverse_processed_path(path)

            result.append(path)
            if path.points:
                current_pos = path.points[-1]

        return result

    def process_svg(self, svg_path: str,
                    optimization_method: str = "greedy_flip",
                    scale_to_fit: bool = True,
                    margin: float = 0.0,
                    alignment: str = "center",
                    offset_x: float = 0.0,
                    offset_y: float = 0.0,
                    scale_mode: str = "fit",
                    scale_value: float = 100.0,
                    target_width: float = 0.0,
                    target_height: float = 0.0,
                    artboard_enabled: bool = False,
                    artboard_width: float = 210.0,
                    artboard_height: float = 297.0,
                    use_arcs: bool = True) -> tuple[str, dict]:
        """
        Full processing pipeline: load, optimize, scale, convert to G-code.

        Returns:
            Tuple of (gcode_string, stats_dict)
        """
        # Load SVG
        paths, attributes, svg_attrs = self.load_svg(svg_path)

        # Parse SVG dimensions (viewBox or width/height)
        parsed_svg_width, parsed_svg_height, svg_min_x, svg_min_y = self.parse_svg_dimensions(svg_attrs)

        initial_paths = len(paths)

        # Convert paths to ProcessedPath (with circle detection)
        # Filter out non-plottable paths (fills without strokes)
        processed_paths = []
        for path, attr in zip(paths, attributes):
            if not self.is_plottable(attr):
                continue
            pp = self.path_to_processed(path, num_samples=50, use_arcs=use_arcs)
            if len(pp.points) >= 2:
                processed_paths.append(pp)

        # Simplify points (but preserve circle/arc metadata)
        if optimization_method != "none":
            for pp in processed_paths:
                # Don't simplify circles or arc-based paths - they're already optimized
                if not pp.is_circle and not pp.is_ellipse and not pp.segments:
                    pp.points = self.simplify_points(pp.points, tolerance=0.5)
            # Remove paths with too few points
            processed_paths = [pp for pp in processed_paths if len(pp.points) >= 2]

        # Scale and position
        dimensions = {}
        if scale_to_fit:
            # Use artboard dimensions as container if enabled
            container_w = artboard_width if artboard_enabled else None
            container_h = artboard_height if artboard_enabled else None
            processed_paths, dimensions = self.scale_processed_paths(
                processed_paths, margin=margin,
                alignment=alignment,
                offset_x=offset_x,
                offset_y=offset_y,
                scale_mode=scale_mode,
                scale_value=scale_value,
                target_width=target_width,
                target_height=target_height,
                svg_width=parsed_svg_width,
                svg_height=parsed_svg_height,
                svg_min_x=svg_min_x,
                svg_min_y=svg_min_y,
                container_width=container_w,
                container_height=container_h
            )

        # Optimize paths using greedy sorting
        if optimization_method != "none":
            processed_paths = self.sort_processed_paths(processed_paths, optimization_method)

        # Calculate bounds
        all_x = [p.x for pp in processed_paths for p in pp.points]
        all_y = [p.y for pp in processed_paths for p in pp.points]

        bounds = None
        if all_x and all_y:
            bounds = {
                "x_min": min(all_x),
                "y_min": min(all_y),
                "x_max": max(all_x),
                "y_max": max(all_y),
            }

        # Count circles
        num_circles = sum(1 for pp in processed_paths if pp.is_circle)

        # Generate G-code
        gcode = self.to_gcode(processed_paths)

        total_points = sum(len(pp.points) for pp in processed_paths)

        stats = {
            "initial_paths": initial_paths,
            "final_paths": len(processed_paths),
            "total_points": total_points,
            "circles": num_circles,
            "bounds": bounds,
            "gcode_lines": len(gcode.splitlines()),
            "dimensions": dimensions,
        }

        return gcode, stats

    def get_preview_paths(self, svg_path: str,
                          optimization_method: str = "greedy_flip",
                          scale_to_fit: bool = True,
                          margin: float = 0.0,
                          alignment: str = "center",
                          offset_x: float = 0.0,
                          offset_y: float = 0.0,
                          scale_mode: str = "fit",
                          scale_value: float = 100.0,
                          target_width: float = 0.0,
                          target_height: float = 0.0,
                          artboard_enabled: bool = False,
                          artboard_width: float = 210.0,
                          artboard_height: float = 297.0) -> tuple[list[dict], dict]:
        """
        Get path data for frontend preview.

        Returns list of path objects with points.
        """
        print(f"[DEBUG] Loading SVG: {svg_path}", flush=True)
        paths, attributes, svg_attrs = self.load_svg(svg_path)
        print(f"[DEBUG] Loaded {len(paths)} paths from SVG", flush=True)

        # Parse SVG dimensions (viewBox or width/height)
        parsed_svg_width, parsed_svg_height, svg_min_x, svg_min_y = self.parse_svg_dimensions(svg_attrs)

        # Convert paths to points (filter out non-plottable paths)
        all_points = []
        non_plottable_count = 0
        print(f"[DEBUG] Converting {len(paths)} paths to points...", flush=True)
        for i, (path, attr) in enumerate(zip(paths, attributes)):
            if not self.is_plottable(attr):
                non_plottable_count += 1
                continue
            points = self.path_to_points(path, num_samples=50)
            if len(points) >= 2:
                all_points.append(points)
            if (i + 1) % 100 == 0:
                print(f"[DEBUG] Converted {i + 1}/{len(paths)} paths...", flush=True)

        if non_plottable_count > 0:
            print(f"[DEBUG] Filtered out {non_plottable_count} non-plottable paths (fill-only, no stroke)", flush=True)
        print(f"[DEBUG] After plottable filter: {len(all_points)} paths", flush=True)

        # Simplify (always run when optimization is enabled)
        if optimization_method != "none":
            pre_simplify_count = len(all_points)
            print(f"[DEBUG] Simplifying {len(all_points)} paths...", flush=True)
            simplified_points = []
            for i, pts in enumerate(all_points):
                simplified = self.simplify_points(pts, tolerance=0.5)
                if len(simplified) >= 2:
                    simplified_points.append(simplified)
                if (i + 1) % 100 == 0:
                    print(f"[DEBUG] Simplified {i + 1}/{len(all_points)} paths...", flush=True)
            all_points = simplified_points
            if len(all_points) < pre_simplify_count:
                print(f"[DEBUG] Simplification removed {pre_simplify_count - len(all_points)} paths (collapsed to < 2 points)", flush=True)
            print(f"[DEBUG] After simplification: {len(all_points)} paths", flush=True)

        # Scale and position
        dimensions = {}
        if scale_to_fit:
            print(f"[DEBUG] Scaling and positioning...", flush=True)
            # Use artboard dimensions as container if enabled
            container_w = artboard_width if artboard_enabled else None
            container_h = artboard_height if artboard_enabled else None
            all_points, dimensions = self.scale_and_position(
                all_points, margin=margin,
                alignment=alignment,
                offset_x=offset_x,
                offset_y=offset_y,
                scale_mode=scale_mode,
                scale_value=scale_value,
                target_width=target_width,
                target_height=target_height,
                svg_width=parsed_svg_width,
                svg_height=parsed_svg_height,
                svg_min_x=svg_min_x,
                svg_min_y=svg_min_y,
                container_width=container_w,
                container_height=container_h
            )
            print(f"[DEBUG] Scaling complete", flush=True)

        # Optimize paths using selected method
        all_points = self.optimize_paths(all_points, optimization_method)
        print(f"[DEBUG] Processing complete, returning {len(all_points)} paths", flush=True)

        # Convert to dict format
        result = []
        for i, points in enumerate(all_points):
            path_data = {
                "points": [{"x": p.x, "y": p.y} for p in points],
                "layer": 0,
            }
            result.append(path_data)

        return result, dimensions
