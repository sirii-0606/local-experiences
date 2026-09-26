import pytest

from app.seed import load_seed


@pytest.fixture(scope="module")
def seed():
    return load_seed()


def test_seed_loads_with_valid_references(seed):
    # load_seed raises on schema errors, duplicate ids, dangling refs, bad evidence keys
    assert len(seed.experiences) >= 45
    assert len(seed.providers) >= 15
    assert {p.kind for p in seed.providers.values()} == {"formal", "informal"}


def test_places_are_in_jaipur(seed):
    for p in seed.places.values():
        assert 26.70 < p.lat < 27.05 and 75.50 < p.lon < 75.95, p.id


def test_windows_can_fit_their_experience(seed):
    # an experience whose every window is shorter than its duration can never be recommended
    for e in seed.experiences.values():
        fits = [
            (w.end.hour * 60 + w.end.minute) - (s.hour * 60 + s.minute) >= e.duration_min
            for w in e.availability
            for s in (w.slots or [w.start])
        ]
        assert any(fits), e.id


def test_every_provider_offers_something(seed):
    used = {e.provider_id for e in seed.experiences.values()}
    assert used == set(seed.providers)
