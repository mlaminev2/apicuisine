from sqlmodel import Session, select, create_engine
from sqlmodel.pool import StaticPool
from sqlmodel import SQLModel
from app.models import Dish
from app.seed import run_seed
from unittest.mock import patch


def make_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    return engine


def test_seed_counts():
    engine = make_session()
    with patch("app.seed.engine", engine):
        run_seed()
        with Session(engine) as session:
            dishes = session.exec(select(Dish)).all()
            assert len(dishes) == 86
            counts = {}
            for d in dishes:
                counts[d.category] = counts.get(d.category, 0) + 1
            assert counts["pomme_de_terre"] == 21
            assert counts["riz"] == 17
            assert counts["pates"] == 11
            assert counts["autre"] == 16
            assert counts["sucree"] == 17
            assert counts["africain"] == 4


def test_seed_idempotent():
    engine = make_session()
    with patch("app.seed.engine", engine):
        run_seed()
        run_seed()
        with Session(engine) as session:
            dishes = session.exec(select(Dish)).all()
            assert len(dishes) == 86


def test_seed_source_tags():
    engine = make_session()
    with patch("app.seed.engine", engine):
        run_seed()
        with Session(engine) as session:
            tartiflette = session.exec(
                select(Dish).where(Dish.name == "Tartiflette (MC)")
            ).first()
            assert tartiflette is not None
            assert tartiflette.source_tag == "MC"
            assert tartiflette.name == "Tartiflette (MC)"
