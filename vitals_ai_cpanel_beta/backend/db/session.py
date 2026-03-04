from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from config import settings

_engine = None
_SessionLocal = None

def get_engine():
    global _engine
    if _engine is None:
        uri = settings.SQLALCHEMY_DATABASE_URI
        if not uri:
            raise RuntimeError('Database is not configured. Set DB_HOST, DB_NAME, DB_USER, DB_PASSWORD or DATABASE_URL.')
        kwargs = dict(pool_pre_ping=True, future=True)
        if not uri.startswith('sqlite'):
            kwargs['pool_recycle'] = 280
        _engine = create_engine(uri, **kwargs)
    return _engine


def get_session_factory():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = scoped_session(sessionmaker(autocommit=False, autoflush=False, bind=get_engine()))
    return _SessionLocal


def db_session():
    """Context manager-like generator for Flask usage."""
    Session = get_session_factory()
    session = Session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
