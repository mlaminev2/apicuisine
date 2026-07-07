from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "dev"  # "dev" | "production"
    database_url: str = "sqlite:///./data/menu.db"
    port: int = 8000
    secret_key: str = "dev-secret-key-change-in-production"

    # Freemium : nombre d'imports de recettes gratuits par mois et par membre
    import_free_limit: int = 3

    # Espace admin : si defini, seul ce compte email y a acces
    # (sinon, le proprietaire du foyer)
    super_admin_email: str = ""

    # Emails rattaches au foyer d'origine (base de recettes complete).
    # Tout autre inscrit sans code d'invitation demarre un foyer vide.
    full_base_emails: str = ""

    # Google OAuth (optionnel)
    google_client_id: str = ""
    google_client_secret: str = ""


settings = Settings()
