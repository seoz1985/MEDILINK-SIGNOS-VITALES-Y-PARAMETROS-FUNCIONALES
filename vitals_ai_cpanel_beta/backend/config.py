import os

class Settings:
    # App
    ENV = os.getenv('APP_ENV', 'production')
    SECRET_KEY = os.getenv('SECRET_KEY', 'change-me')

    # CORS
    CORS_ALLOW_ORIGINS = [o.strip() for o in os.getenv('CORS_ALLOW_ORIGINS', '').split(',') if o.strip()]

    # Database (cPanel MySQL)
    DB_HOST = os.getenv('DB_HOST', 'localhost')
    DB_PORT = int(os.getenv('DB_PORT', '3306'))
    DB_NAME = os.getenv('DB_NAME', '')
    DB_USER = os.getenv('DB_USER', '')
    DB_PASSWORD = os.getenv('DB_PASSWORD', '')

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        # mysql+pymysql://user:pass@host:port/db?charset=utf8mb4
        if not (self.DB_NAME and self.DB_USER):
            return ''
        return (
            f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?charset=utf8mb4"
        )

    # AI
    TRIAGE_MODEL_PATH = os.getenv('TRIAGE_MODEL_PATH', 'models_store/triage_model.joblib')
    LLM_BASE_URL = os.getenv('LLM_BASE_URL', '')  # e.g., https://llm.example.com/v1
    LLM_API_KEY = os.getenv('LLM_API_KEY', '')
    LLM_MODEL_NAME = os.getenv('LLM_MODEL_NAME', 'mistral')

settings = Settings()
