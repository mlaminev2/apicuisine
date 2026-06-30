from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./data/menu.db"
    port: int = 8000
    secret_key: str = "dev-secret-key-change-in-production"

    # Google OAuth (optionnel)
    google_client_id: str = ""
    google_client_secret: str = ""

    # Apple OAuth (optionnel)
    apple_client_id: str = ""      # Services ID (ex: com.example.menus-famille)
    apple_team_id: str = ""        # 10-char Team ID
    apple_key_id: str = ""         # Key ID from developer.apple.com
    apple_private_key: str = ""    # Contenu du fichier .p8 (clé ES256)

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
