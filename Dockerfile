FROM alpine:3.21

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

WORKDIR /app

RUN apk add --no-cache python3 py3-flask py3-requests py3-gunicorn ca-certificates \
    && adduser -D -u 10001 app

COPY . .

USER app

EXPOSE 5000

# Keep a single process so in-memory download store works reliably.
CMD ["gunicorn", "--workers", "1", "--threads", "8", "--timeout", "150", "--bind", "0.0.0.0:5000", "app:app"]
