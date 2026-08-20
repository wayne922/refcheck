#!/bin/bash
set -e

PROJECT_ID="agent-os-shared-497623"
REGION="australia-southeast1"
SERVICE_NAME="refcheck"

echo "🚀 Deploying RefCheck Portal to GCP Cloud Run..."
echo "Project: $PROJECT_ID | Region: $REGION | Service: $SERVICE_NAME"

gcloud config set project $PROJECT_ID

if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "📦 Building and deploying directly via Cloud Run source deploy..."
CLOUDSDK_METRICS_ENVIRONMENT=datacloud.antigravity gcloud run deploy $SERVICE_NAME \
  --source . \
  --project $PROJECT_ID \
  --platform managed \
  --region $REGION \
  --port 8080 \
  --allow-unauthenticated \
  --min-instances 1 \
  --max-instances 2 \
  --memory 512Mi \
  --set-env-vars "NODE_ENV=production,DATABASE_URL=${DATABASE_URL},JWT_SECRET=${JWT_SECRET:-default_refcheck_secret_key_123456},SENDGRID_API_KEY=${SENDGRID_API_KEY},SENDGRID_FROM_EMAIL=${SENDGRID_FROM_EMAIL},GEMINI_API_KEY=${GEMINI_API_KEY},APP_URL=${APP_URL:-https://vetting.candidex.co.nz}" \
  --quiet

echo "✅ GCP Cloud Run deployment complete!"
