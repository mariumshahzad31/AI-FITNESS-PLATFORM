"""Synthetic-but-realistic dataset generation for the ML models.

Real public fitness datasets that join body metrics, goals and prescribed
programs are not freely redistributable, so we generate physiologically
grounded synthetic data. Targets are derived from established sports-science
formulas (Mifflin-St Jeor TDEE, safe weekly weight-change rates) plus
controlled noise, which gives the models a learnable, non-trivial signal.
"""

import numpy as np
import pandas as pd

from .constants import (
    ACTIVITY_FACTORS,
    ACTIVITY_LEVELS,
    FITNESS_LEVELS,
    GENDERS,
    GOAL_CALORIE_DELTA,
    GOAL_WEEKLY_RATE,
    GOALS,
    CALORIE_DATASET,
    TIMELINE_DATASET,
    SPLIT_DATASET,
    mifflin_st_jeor,
)

_RNG = np.random.default_rng(42)


def _random_profiles(n):
    age = _RNG.integers(16, 70, n)
    gender = _RNG.choice(GENDERS, n)
    height = np.where(
        gender == "male",
        _RNG.normal(177, 7, n),
        _RNG.normal(164, 6, n),
    ).clip(145, 205)
    weight = np.where(
        gender == "male",
        _RNG.normal(82, 14, n),
        _RNG.normal(68, 12, n),
    ).clip(42, 160)
    activity = _RNG.choice(ACTIVITY_LEVELS, n)
    goal = _RNG.choice(GOALS, n)
    return age, gender, height, weight, activity, goal


def build_calorie_dataset(n=4000):
    """Daily calorie target from body metrics, activity and goal."""
    age, gender, height, weight, activity, goal = _random_profiles(n)
    rows = []
    for i in range(n):
        bmr = mifflin_st_jeor(weight[i], height[i], age[i], gender[i])
        tdee = bmr * ACTIVITY_FACTORS[activity[i]]
        target = tdee + GOAL_CALORIE_DELTA[goal[i]]
        target += _RNG.normal(0, 60)  # individual variation
        target = max(1200, target)    # physiological floor
        rows.append(
            dict(
                age=int(age[i]),
                gender=gender[i],
                height_cm=round(float(height[i]), 1),
                weight_kg=round(float(weight[i]), 1),
                activity_level=activity[i],
                goal=goal[i],
                calorie_target=round(float(target)),
            )
        )
    df = pd.DataFrame(rows)
    df.to_csv(CALORIE_DATASET, index=False)
    return df


def build_timeline_dataset(n=4000):
    """Weeks to reach a target weight, given the goal and activity."""
    age, gender, height, weight, activity, goal = _random_profiles(n)
    rows = []
    for i in range(n):
        g = goal[i]
        if g == "weight_loss":
            delta = _RNG.uniform(2, 30)
        elif g == "muscle_gain":
            delta = _RNG.uniform(1, 12)
        else:
            delta = _RNG.uniform(0, 4)
        rate = GOAL_WEEKLY_RATE[g]
        # Heavier deficits/surpluses slow down near the edges; activity speeds up.
        activity_boost = 0.9 + 0.1 * ACTIVITY_LEVELS.index(activity[i])
        weeks = (delta / max(rate * activity_boost, 0.05)) + _RNG.normal(0, 1.5)
        weeks = float(np.clip(weeks, 1, 104))
        rows.append(
            dict(
                weight_delta=round(delta, 1),
                goal=g,
                activity_level=activity[i],
                age=int(age[i]),
                weeks_to_goal=round(weeks, 1),
            )
        )
    df = pd.DataFrame(rows)
    df.to_csv(TIMELINE_DATASET, index=False)
    return df


def build_split_dataset(n=4000):
    """Which training split best fits a goal / level / availability profile."""
    rows = []
    goal = _RNG.choice(GOALS, n)
    level = _RNG.choice(FITNESS_LEVELS, n)
    days = _RNG.integers(2, 7, n)
    minutes = _RNG.choice([20, 30, 45, 60, 75, 90], n)
    for i in range(n):
        g, lv, d, m = goal[i], level[i], int(days[i]), int(minutes[i])
        # Coaching heuristic the classifier learns to generalise.
        if g in ("weight_loss", "endurance"):
            split = "cardio_strength"
        elif d <= 3 or lv == "Beginner":
            split = "full_body"
        elif d == 4:
            split = "upper_lower"
        else:
            split = "push_pull_legs"
        # Inject a little label noise so the model isn't a pure lookup table.
        if _RNG.random() < 0.05:
            split = _RNG.choice(["full_body", "upper_lower", "push_pull_legs", "cardio_strength"])
        rows.append(dict(goal=g, fitness_level=lv, days_per_week=d, session_minutes=m, split=split))
    df = pd.DataFrame(rows)
    df.to_csv(SPLIT_DATASET, index=False)
    return df
