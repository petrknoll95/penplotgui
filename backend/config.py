from pydantic import BaseModel
from pydantic_settings import BaseSettings
from typing import Optional
import json
from pathlib import Path


# Hard limits for bed size (physical constraints - motors hit rails beyond this)
MAX_BED_WIDTH = 426.0
MAX_BED_HEIGHT = 599.0


class PlotterProfile(BaseModel):
    """Configuration profile for a plotter setup."""
    name: str = "default"
    bed_width: float = MAX_BED_WIDTH  # mm (max bed size)
    bed_height: float = MAX_BED_HEIGHT  # mm (max bed size)
    rapid_feed_rate: float = 8000.0  # mm/min
    draw_feed_rate: float = 6000.0  # mm/min
    pen_up_height: float = 5.0  # mm
    pen_down_height: float = 0.0  # mm
    steps_per_mm_x: float = 53.3
    steps_per_mm_y: float = 53.3
    steps_per_mm_z: float = 400.0
    easing_enabled: bool = True

    def model_post_init(self, __context):
        """Enforce hard limits after initialization."""
        object.__setattr__(self, 'bed_width', min(self.bed_width, MAX_BED_WIDTH))
        object.__setattr__(self, 'bed_height', min(self.bed_height, MAX_BED_HEIGHT))


class Settings(BaseSettings):
    """Application settings."""
    host: str = "0.0.0.0"
    port: int = 8000
    arduino_host: str = "192.168.1.46"  # Arduino IP
    arduino_port: int = 81
    upload_dir: str = "uploads"
    profiles_file: str = "profiles.json"

    class Config:
        env_prefix = "PLOTTER_"


settings = Settings()


class ProfileManager:
    """Manages plotter configuration profiles."""

    def __init__(self, profiles_file: str):
        self.profiles_file = Path(profiles_file)
        self.profiles: dict[str, PlotterProfile] = {}
        self.active_profile: str = "default"
        self._load_profiles()

    def _load_profiles(self):
        """Load profiles from file."""
        if self.profiles_file.exists():
            try:
                data = json.loads(self.profiles_file.read_text())
                for name, profile_data in data.get("profiles", {}).items():
                    self.profiles[name] = PlotterProfile(**profile_data)
                self.active_profile = data.get("active", "default")
            except Exception as e:
                print(f"Error loading profiles: {e}")

        # Ensure default profile exists
        if "default" not in self.profiles:
            self.profiles["default"] = PlotterProfile()

    def _save_profiles(self):
        """Save profiles to file."""
        data = {
            "active": self.active_profile,
            "profiles": {name: profile.model_dump() for name, profile in self.profiles.items()}
        }
        self.profiles_file.write_text(json.dumps(data, indent=2))

    def get_profile(self, name: Optional[str] = None) -> PlotterProfile:
        """Get a profile by name, or the active profile."""
        name = name or self.active_profile
        return self.profiles.get(name, self.profiles["default"])

    def set_profile(self, name: str, profile: PlotterProfile):
        """Create or update a profile."""
        self.profiles[name] = profile
        self._save_profiles()

    def delete_profile(self, name: str) -> bool:
        """Delete a profile (cannot delete 'default')."""
        if name == "default":
            return False
        if name in self.profiles:
            del self.profiles[name]
            if self.active_profile == name:
                self.active_profile = "default"
            self._save_profiles()
            return True
        return False

    def set_active(self, name: str) -> bool:
        """Set the active profile."""
        if name in self.profiles:
            self.active_profile = name
            self._save_profiles()
            return True
        return False

    def list_profiles(self) -> list[str]:
        """List all profile names."""
        return list(self.profiles.keys())


profile_manager = ProfileManager(settings.profiles_file)
