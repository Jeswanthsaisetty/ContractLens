from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "ContractLens"
    environment: str = "development"

    # xKiro
    xkiro_api_key: str
    xkiro_base_url: str = "https://api.xkiro.com/v1"
    xkiro_model: str = "google/gemini-3.6-flash"

    # Database
    database_url: str = "sqlite:///./contractlens.db"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )


settings = Settings()