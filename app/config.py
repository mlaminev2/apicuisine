from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./data/menu.db"
    port: int = 8000
    secret_key: str = "dev-secret-key-change-in-production"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
