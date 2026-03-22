# OnionCraft — Deployment Guide

## Prerequisites

- Azure subscription (free tier or MSDN credit)
- GitHub repository connected to Azure Static Web Apps
- Node.js 22+

## Azure Static Web Apps Setup

### 1. Create the SWA Resource

```bash
az staticwebapp create \
  --name onioncraft \
  --resource-group onioncraft-rg \
  --source https://github.com/trobichaux/onioncraft \
  --branch main \
  --app-location "/" \
  --output-location ".next" \
  --login-with-github
```

Or create via the Azure Portal:
1. Search "Static Web Apps" → Create
2. Select your GitHub repo and branch
3. Build preset: **Next.js**
4. App location: `/`
5. Output location: `.next`

### 2. Configure Deployment Token

After creating the SWA resource:

```bash
# Get the deployment token
az staticwebapp secrets list --name onioncraft --resource-group onioncraft-rg

# Add to GitHub Secrets
# Settings → Secrets → Actions → New repository secret
# Name: AZURE_STATIC_WEB_APPS_API_TOKEN
# Value: <paste token>
```

### 3. Configure Environment Variables

In the Azure Portal → Static Web App → Configuration → Application settings:

| Name | Value | Notes |
|------|-------|-------|
| `AZURE_STORAGE_CONNECTION_STRING` | `DefaultEndpointsProtocol=https;...` | Production Table Storage connection string |
| `GW2_API_BASE_URL` | `https://api.guildwars2.com/v2` | Optional — defaults to this |

> **Production:** Use Managed Identity + RBAC for Table Storage instead of connection strings when possible.

### 4. Create Azure Table Storage

```bash
# Create storage account
az storage account create \
  --name onioncraftstorage \
  --resource-group onioncraft-rg \
  --location eastus2 \
  --sku Standard_LRS \
  --kind StorageV2

# Tables are auto-created by the app on first request
```

### 5. Verify Deployment

After pushing to `main`, the GitHub Actions workflow will:
1. Run lint, type-check, and tests
2. Build the Next.js app
3. Deploy to Azure Static Web Apps

Check the Actions tab for deployment status.

## Local Development

See [README.md](../README.md) for local development instructions.

## Cost Estimation

With MSDN $150/month credit:
- **Static Web Apps Free tier**: $0 (includes 100GB bandwidth, 2 custom domains)
- **Table Storage**: ~$0.01/month for small data volumes
- **Total estimated**: < $1/month
