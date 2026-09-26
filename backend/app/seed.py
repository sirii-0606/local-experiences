"""Load and validate the curated seed data (data/seed/*.json)."""

from dataclasses import dataclass
from pathlib import Path

from pydantic import TypeAdapter

from app.models import Experience, Place, Provider, Stay

SEED_DIR = Path(__file__).resolve().parents[1] / "data" / "seed"


@dataclass(frozen=True)
class Seed:
    providers: dict[str, Provider]
    places: dict[str, Place]
    experiences: dict[str, Experience]
    stays: dict[str, Stay] = None

    def __post_init__(self):
        if self.stays is None:
            object.__setattr__(self, "stays", {})


def _read(path: Path, model):
    if not path.is_file():
        return {}
    items = TypeAdapter(list[model]).validate_json(path.read_bytes())
    by_id = {i.id: i for i in items}
    if len(by_id) != len(items):
        raise ValueError(f"duplicate id in {path.name}")
    return by_id


def load_seed(seed_dir: Path = SEED_DIR) -> Seed:
    stays_file = seed_dir / "stays.json"
    stays_dict = _read(stays_file, Stay) if stays_file.is_file() else {}
    seed = Seed(
        providers=_read(seed_dir / "providers.json", Provider),
        places=_read(seed_dir / "places.json", Place),
        experiences=_read(seed_dir / "experiences.json", Experience),
        stays=stays_dict,
    )
    for e in seed.experiences.values():
        if e.provider_id not in seed.providers:
            raise ValueError(f"{e.id}: unknown provider {e.provider_id}")
        if e.place_id not in seed.places:
            raise ValueError(f"{e.id}: unknown place {e.place_id}")
        if bad := set(e.evidence) - set(Experience.model_fields):
            raise ValueError(f"{e.id}: evidence for unknown attributes {bad}")
    return seed
