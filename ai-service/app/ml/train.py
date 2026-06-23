"""Training pipeline.

Run directly to (re)generate datasets and fit all models:

    python -m app.ml.train

Models are persisted with joblib next to the datasets in app/data/.
The pipeline is also invoked lazily on first inference if artifacts are
missing, so the service is self-bootstrapping.
"""

import logging

import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor, RandomForestClassifier
from sklearn.metrics import accuracy_score, mean_absolute_error
from sklearn.model_selection import train_test_split

from . import datasets
from .constants import (
    ACTIVITY_LEVELS,
    FITNESS_LEVELS,
    GENDERS,
    GOALS,
    CALORIE_MODEL_PATH,
    TIMELINE_MODEL_PATH,
    SPLIT_MODEL_PATH,
    encode,
)

logger = logging.getLogger(__name__)


def _calorie_features(df):
    return np.column_stack(
        [
            df["age"].to_numpy(),
            [encode(g, GENDERS) for g in df["gender"]],
            df["height_cm"].to_numpy(),
            df["weight_kg"].to_numpy(),
            [encode(a, ACTIVITY_LEVELS) for a in df["activity_level"]],
            [encode(g, GOALS) for g in df["goal"]],
        ]
    )


def _timeline_features(df):
    return np.column_stack(
        [
            df["weight_delta"].to_numpy(),
            [encode(g, GOALS) for g in df["goal"]],
            [encode(a, ACTIVITY_LEVELS) for a in df["activity_level"]],
            df["age"].to_numpy(),
        ]
    )


def _split_features(df):
    return np.column_stack(
        [
            [encode(g, GOALS) for g in df["goal"]],
            [encode(lv, FITNESS_LEVELS) for lv in df["fitness_level"]],
            df["days_per_week"].to_numpy(),
            df["session_minutes"].to_numpy(),
        ]
    )


def train_calorie_model():
    df = datasets.build_calorie_dataset()
    X, y = _calorie_features(df), df["calorie_target"].to_numpy()
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=7)
    model = GradientBoostingRegressor(n_estimators=300, max_depth=3, learning_rate=0.05, random_state=7)
    model.fit(X_tr, y_tr)
    mae = mean_absolute_error(y_te, model.predict(X_te))
    joblib.dump(model, CALORIE_MODEL_PATH)
    logger.info("calorie_model trained — MAE %.1f kcal", mae)
    return mae


def train_timeline_model():
    df = datasets.build_timeline_dataset()
    X, y = _timeline_features(df), df["weeks_to_goal"].to_numpy()
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=7)
    model = GradientBoostingRegressor(n_estimators=250, max_depth=3, learning_rate=0.05, random_state=7)
    model.fit(X_tr, y_tr)
    mae = mean_absolute_error(y_te, model.predict(X_te))
    joblib.dump(model, TIMELINE_MODEL_PATH)
    logger.info("timeline_model trained — MAE %.2f weeks", mae)
    return mae


def train_split_model():
    df = datasets.build_split_dataset()
    X, y = _split_features(df), df["split"].to_numpy()
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=7)
    model = RandomForestClassifier(n_estimators=200, max_depth=8, random_state=7)
    model.fit(X_tr, y_tr)
    acc = accuracy_score(y_te, model.predict(X_te))
    joblib.dump(model, SPLIT_MODEL_PATH)
    logger.info("split_model trained — accuracy %.3f", acc)
    return acc


def train_all():
    logging.basicConfig(level=logging.INFO)
    logger.info("Training AI Fitness models...")
    train_calorie_model()
    train_timeline_model()
    train_split_model()
    logger.info("All models trained and saved to app/data/.")


if __name__ == "__main__":
    train_all()
