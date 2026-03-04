"""Script CLI para inicializar la DB (alternativa al endpoint /api/v1/db/init)."""

from db.models import Base
from db.session import get_engine

if __name__ == '__main__':
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    print('OK: tablas creadas')
