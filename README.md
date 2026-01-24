# TebroShelf

Self-hosted eBook and Manga library manager.

## Setup

1. Copy `.env.example` to `.env`
2. Run `docker-compose up --build`
3. Access at http://localhost (or configured FRONTEND_PORT)

## Development

Run `docker compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.dev up`

## Production

Run `docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d`

## Rebuild après changements

Run `docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d --build`
