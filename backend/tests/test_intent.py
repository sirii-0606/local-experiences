from datetime import datetime

import pytest

from app.intent import parse_rules, to_state
from app.seed import load_seed

SEED = load_seed()
NOW = datetime(2026, 9, 26, 13, 0)


@pytest.mark.parametrize(
    "text, expected",
    [
        (
            "family of 4 with two kids near Hawa Mahal, free 4–6 pm, ₹1500, local food",
            {
                "near": "Hawa Mahal",
                "start_time": "16:00",
                "end_time": "18:00",
                "budget_inr": 1500,
                "group_size": 4,
                "children": 2,
            },
        ),
        (
            "2 hours between lunch and my train, budget Rs 400, with my parents, nothing crowded",
            {
                "duration_min": 120,
                "budget_inr": 400,
                "seniors": 2,
                "avoid_crowds": True,
                "raining": None,
            },
        ),  # "train" must not read as rain
        (
            "solo wheelchair user, half an hour near Albert Hall, indoors",
            {"duration_min": 30, "adults": 1, "accessibility": ["wheelchair"], "indoor_only": True},
        ),
        (
            "show me hidden gems and pottery workshops, it's raining, until 7pm",
            {"end_time": "19:00", "hidden_gems": True, "raining": True},
        ),
        (
            "couple, romantic dinner near City Palace, 3000 rupees",
            {"near": "City Palace", "adults": 2, "budget_inr": 3000},
        ),
    ],
)
def test_rule_parser(text, expected):
    p = parse_rules(text, SEED)
    for k, v in expected.items():
        assert getattr(p, k) == v, (k, getattr(p, k))


def test_rule_parser_does_not_invent_intents_from_place_names_or_filler():
    p = parse_rules("show me something near City Palace", SEED)
    assert "heritage" not in p.intents and "performance" not in p.intents


def test_to_state_builds_group_and_window():
    s = to_state(parse_rules("I have 90 minutes with my parents, Rs 600", SEED), NOW, SEED)
    assert [t.age >= 65 for t in s.group].count(True) == 2 and len(s.group) == 3
    assert (s.window_end - s.window_start).total_seconds() == 90 * 60
    assert s.budget_inr == 600


def test_whole_group_statements_replace_the_previous_group():
    family = to_state(parse_rules("family of 4 with 2 kids, ₹2000", SEED), NOW, SEED)
    solo = to_state(
        parse_rules("Solo, near Tripolia Bazaar, 12 to 3pm, ₹1000", SEED), NOW, SEED, family
    )
    assert len(solo.group) == 1 and solo.group[0].age >= 16
    couple = to_state(parse_rules("a couple, ₹3000", SEED), NOW, SEED, family)
    assert len(couple.group) == 2 and all(t.age >= 16 for t in couple.group)
    # adding people still builds on the previous group
    with_parents = to_state(
        parse_rules("actually my parents are coming too", SEED), NOW, SEED, solo
    )
    assert len(with_parents.group) == 3


def test_to_state_refines_previous_state():
    base = to_state(
        parse_rules("family of 4 with 2 kids aged 6-year-old and 9-year-old, ₹2000", SEED),
        NOW,
        SEED,
    )
    s = to_state(parse_rules("it's raining now", SEED), NOW, SEED, base)
    assert s.weather == "rain" and s.budget_inr == 2000 and len(s.group) == 4
    assert sorted(t.age for t in s.group if t.age < 16) == [6, 9]


def test_llm_output_is_validated_and_rules_win_on_exact_values():
    from app.intent import ParsedRequest, merge

    # what a small model actually sent: a range in one field, strings for numbers, a bogus age
    sloppy = ParsedRequest.model_validate(
        {
            "start_time": "4-6 pm",
            "group_size": "4",
            "my_age": 900,
            "child_ages": [76, 5],
            "intents": ["local-food", "cultural"],
            "with_companions": True,
        }
    )
    assert (sloppy.start_time, sloppy.group_size, sloppy.my_age) == (None, 4, None)
    assert sloppy.child_ages == [5] and sloppy.intents == ["local-food", "heritage", "performance"]
    rules = parse_rules("family of 4 with two kids, free 4-6 pm, 1500 rupees, a student", SEED)
    merged = merge(sloppy, rules)
    assert (merged.start_time, merged.end_time, merged.budget_inr) == ("16:00", "18:00", 1500)
    assert merged.budget_hint == "low"  # the LLM missed it; the rules filled the gap
    assert merged.intents == ["local-food", "heritage", "performance"]  # meaning stays the LLM's
