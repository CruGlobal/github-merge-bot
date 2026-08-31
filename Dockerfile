# NODE_VERSION set by build.sh based on .tool-versions file
ARG NODE_VERSION=latest
# Use standard Node.js image for building
FROM public.ecr.aws/docker/library/node:${NODE_VERSION} AS builder

# Build the lambda function
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Download and extract the secrets-lambda-extension
FROM public.ecr.aws/docker/library/alpine:latest AS extension
RUN mkdir -p /opt/secrets-lambda-extension && \
    wget https://github.com/CruGlobal/secrets-lambda-extension/releases/latest/download/secrets-lambda-extension-linux-amd64.tar.gz -q -O - |tar -xzC /opt/secrets-lambda-extension/

# NODE_VERSION set by build.sh based on .tool-versions file
ARG NODE_VERSION=latest
# Use AWS Lambda Node.js base image for the final image
FROM public.ecr.aws/lambda/nodejs:${NODE_VERSION}

# Set environment variables for the Lambda function.
# PROJECT_NAME / ENVIRONMENT are injected as function env vars at runtime by the
# aws/lambda/app module, so the image stays environment-neutral (build once,
# promote the same bytes to every environment).
ENV NODE_OPTIONS=--enable-source-maps

# Set the Lambda task root directory
WORKDIR ${LAMBDA_TASK_ROOT}

# Copy the secrets-lambda-extension from the extension stage and setup wrapper
COPY --from=extension /opt/secrets-lambda-extension /opt/secrets-lambda-extension
ENV AWS_LAMBDA_EXEC_WRAPPER=/opt/secrets-lambda-extension/secrets-wrapper

# Setup DataDog metrics/logs
RUN npm install datadog-lambda-js dd-trace
COPY --from=public.ecr.aws/datadog/lambda-extension:latest /opt/. /opt/
CMD ["node_modules/datadog-lambda-js/dist/handler.handler"]

# Copy the built application from the builder stage
COPY --from=builder /app/dist ./

# Build identity -> Datadog version. Passed by build-candidate as
# --build-arg VERSION; "dev" for local builds. Last on purpose: nothing else in
# the build depends on it, so a new build number invalidates no earlier layer.
ARG VERSION="dev"
ENV DD_VERSION=${VERSION}
