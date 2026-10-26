# syntax=docker/dockerfile:1

# ---------- Build stage: compile the Spring Boot jar ----------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
# Cache dependencies in their own layer so code-only changes rebuild fast.
RUN mvn -B -q dependency:go-offline || true
COPY src ./src
RUN mvn -B -q package -DskipTests

# ---------- Runtime stage: small JRE image ----------
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --create-home --uid 10001 aurora \
    && mkdir -p /app/data/uploads && chown -R aurora:aurora /app/data
COPY --from=build /app/target/aurora-chat-backend.jar app.jar
USER aurora

# Tuned for small free-tier instances (512 MB RAM, shared CPU).
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -Xss512k"
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
