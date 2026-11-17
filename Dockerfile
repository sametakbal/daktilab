# Single image: builds the frontend and the Go API, which serves both on :8080.
FROM node:22-alpine AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN VITE_API_URL=/api npm run build

FROM golang:1.27-alpine AS api
WORKDIR /src
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/import-words ./cmd/import-words

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=api /out/ /usr/local/bin/
COPY --from=web /web/dist /srv/web
ENV ADDR=:8080 STATIC_DIR=/srv/web
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/api"]
