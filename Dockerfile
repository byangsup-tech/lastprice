# lastprice web dashboard — zero runtime deps, just Python.
FROM python:3.11-slim

WORKDIR /app
COPY . .

ENV PORT=8000 HOST=0.0.0.0
EXPOSE 8000

# Default to the demo dashboard. For live data, override CMD with --live and
# provide PPT_API_KEY / SOL_USD / PHYGITALS_API_BASE as environment variables.
CMD ["sh", "-c", "python -m lastprice --serve --host \"$HOST\" --port \"$PORT\""]
