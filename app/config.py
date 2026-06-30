from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./data/menu.db"
    port: int = 8000
    secret_key: str = "dev-secret-key-change-in-production"

    # Google OAuth (optionnel)
    google_client_id: str = ""
    google_client_secret: str = ""


settings = Settings()
