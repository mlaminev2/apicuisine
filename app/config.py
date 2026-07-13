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

    # Email transactionnel (reinitialisation de mot de passe)
    # Hostinger : smtp.hostinger.com port 465, identifiants de la boite mail
    smtp_host: str = ""
    smtp_port: int = 465
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    app_base_url: str = "http://localhost:8000"

    # Suivi d'audience (chargé seulement après consentement RGPD)
    gtm_container_id: str = ""    # Google Tag Manager, ex. GTM-XXXXXXX (contient GA4, Pixel…)
    ga_measurement_id: str = ""   # Google Analytics 4 direct, ex. G-XXXXXXXXXX (si pas de GTM)
    meta_pixel_id: str = ""        # Pixel Meta/Facebook direct, ex. 123456789012345 (si pas de GTM)
    adsense_client_id: str = ""    # Google AdSense, ex. ca-pub-XXXXXXXXXXXXXXXX (affichage de pubs)

    # Google OAuth (optionnel)
    google_client_id: str = ""
    google_client_secret: str = ""

    # Paiements Stripe (abonnement Premium). Vides = paiement désactivé.
    stripe_secret_key: str = ""         # sk_test_... puis sk_live_...
    stripe_publishable_key: str = ""    # pk_test_... puis pk_live_...
    stripe_webhook_secret: str = ""     # whsec_... (signature des webhooks)
    stripe_price_monthly: str = ""      # price_... abonnement mensuel
    stripe_price_yearly: str = ""       # price_... abonnement annuel

    # Notifications push web (VAPID). Vides = notifications désactivées.
    vapid_public_key: str = ""       # clé publique (application server key, base64url) — exposée au front
    vapid_private_key_b64: str = ""  # clé privée PEM encodée en base64 (tient sur une ligne de .env)
    vapid_subject: str = "mailto:contact@menuenfamille.fr"  # contact requis par le protocole

    @property
    def stripe_enabled(self) -> bool:
        """Le paiement n'est actif que si la clé et au moins un tarif existent."""
        return bool(self.stripe_secret_key and (self.stripe_price_monthly or self.stripe_price_yearly))

    @property
    def push_enabled(self) -> bool:
        """Les notifications ne sont actives que si les deux clés VAPID existent."""
        return bool(self.vapid_public_key and self.vapid_private_key_b64)

    @property
    def vapid_private_pem(self) -> str:
        """Reconstitue la clé privée PEM à partir de sa forme base64."""
        import base64
        if not self.vapid_private_key_b64:
            return ""
        return base64.b64decode(self.vapid_private_key_b64).decode()


settings = Settings()
