# syntax=docker/dockerfile:1

# The web front end as an image: the production build (npm run build), served
# by Caddy on :8080, plain HTTP, as a user that is not root (Caddyfile has the
# rules). docs/deploying.md says what it answers.
#
#   docker build --build-arg VERSION=$(git describe --tags --always) \
#     --build-arg COMMIT=$(git rev-parse HEAD | cut -c1-7) -t aishie-frontend:dev .

# The build, made on the build machine's own architecture: its files are the
# same for every target, so a multi-architecture image builds it once, with no
# emulation. Node is .nvmrc's.
#
# Nothing configures it: no .env reaches it (.dockerignore) and no VITE_
# variable is set, so it is CI's build, for any server. Core is on the page's
# own origin (VITE_API_BASE and VITE_CORE_PUBLIC_URL empty), and single sign-on
# is as Core says (GET /v1/auth/methods), or none from a Core too old to say
# (VITE_SSO_ENABLED unset, so false).
FROM --platform=$BUILDPLATFORM node:24-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
# What /version.json answers, from the build arguments alone: the image's
# version and its commit, nothing the app bundles. Both are checked, so that
# the file is JSON without escaping anything.
ARG VERSION=dev
ARG COMMIT=unknown
RUN case "$VERSION" in \
      '' | *[!0-9A-Za-z.+_-]*) echo "VERSION must be letters, digits and . + _ -: $VERSION" >&2; exit 1 ;; \
    esac \
 && case "$COMMIT" in \
      unknown | [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;; \
      *) echo "COMMIT must be the first 7 hex digits of a commit: $COMMIT" >&2; exit 1 ;; \
    esac \
 && printf '{"version":"%s","commit":"%s"}\n' "$VERSION" "$COMMIT" > /version.json

# Caddy, from its official image, less the file capability that image gives
# it to bind ports below 1024. This one listens on 8080; and a binary that
# asks for a capability cannot even start, as a user that is not root, in a
# container that drops them all (cap_drop: [ALL]). A plain copy leaves the
# capability behind.
FROM caddy:2.11-alpine AS caddy
FROM --platform=$BUILDPLATFORM alpine:3.23 AS caddy-plain
COPY --from=caddy /usr/bin/caddy /caddy-with-capability
RUN cp /caddy-with-capability /caddy

# The official image's own base, with Caddy, the MIME types it serves files
# by, the configuration and the build. Busybox stays, for a health check that
# runs inside the container (wget). Nothing here runs a command, so no target
# architecture is emulated.
FROM alpine:3.23
COPY --from=caddy-plain /caddy /usr/bin/caddy
COPY --from=caddy /etc/mime.types /etc/mime.types
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist /srv
COPY --from=build /version.json /srv/version.json
# Caddy writes nothing (Caddyfile), but has somewhere to if it must.
ENV XDG_CONFIG_HOME=/tmp/caddy/config XDG_DATA_HOME=/tmp/caddy/data
# Distroless's nonroot, as Core's and the agent runtime's images run: it owns
# nothing here, and reads what everyone may.
USER 65532:65532
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --start-interval=1s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/version.json || exit 1
ENTRYPOINT ["caddy"]
CMD ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
