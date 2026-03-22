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
- **Table Storage**: ~$0.05–0.15/month (see breakdown below)
- **Total estimated**: < $1/month

### Table Storage Cost Breakdown

Pricing (LRS, East US 2): $0.045/GB storage, $0.00036/10K transactions.

| Operation | Estimated Volume/Month | Cost |
|-----------|----------------------|------|
| **Storage** (Settings, PriceCache, SkinCache, GoalProgress, ShoppingList) | < 100 MB | ~$0.005 |
| **Skin collection refresh** (read SkinCache + write owned IDs + meta) | ~500–1,000 transactions per refresh × ~4 refreshes/month | ~$0.002 |
| **Skin change check** (read Settings, 1 GW2 API call) | ~3 transactions × ~30 page loads/month | negligible |
| **Collection GET** (read Settings metadata) | ~2 transactions × ~30 page loads/month | negligible |
| **SkinCache writes** (batch upsert during refresh) | ~900 batch transactions per full catalog refresh × ~1/month | ~$0.003 |
| **PriceCache reads/writes** (crafting profit + skin refresh) | ~500 transactions/month | ~$0.002 |
| **Settings CRUD** (API key, rules, filters, owned IDs) | ~50 transactions/month | negligible |
| **GoalProgress + ShoppingList** | ~100 transactions/month | negligible |
| **Total transactions** | ~5,000–10,000/month | **~$0.004–0.04** |

**Key change from previous estimate**: Persisting owned skin IDs and collection metadata adds ~6 extra Settings transactions per page load (read collectionMeta, read ownedSkinIds) plus ~4 writes per refresh. This has negligible cost impact — the per-transaction price at this volume rounds to effectively $0.

---

## Billing Controls & Cost Monitoring

### 1. Weekly Cost Report Email (Actual + Forecast)

Azure Cost Management Scheduled Actions send a weekly email showing actual spend to date and projected spend for the rest of the billing cycle.

**Step 1: Create a Cost Management View (via Azure Portal)**

1. Go to **Cost Management** → **Cost analysis**
2. Set the view to **"AccumulatedCosts"** with timeframe **"BillingMonth"**
3. Ensure both **Actual cost** and **Forecast** are shown
4. Click **Save** → name it `onioncraft-weekly-view`
5. Note the view's resource ID (visible in URL or via API)

**Step 2: Create the Scheduled Action (via CLI)**

```bash
# Get your subscription ID
SUB_ID=$(az account show --query id -o tsv)

# Create the weekly email report
az rest --method put \
  --uri "https://management.azure.com/subscriptions/${SUB_ID}/providers/Microsoft.CostManagement/scheduledActions/onioncraft-weekly-report?api-version=2023-11-01" \
  --body '{
    "kind": "Email",
    "properties": {
      "displayName": "OnionCraft Weekly Cost Report",
      "notification": {
        "subject": "OnionCraft — Weekly Azure Spend Report",
        "to": ["tim@robichaux.net"],
        "message": "Weekly actual spend and forecast for the OnionCraft resource group."
      },
      "schedule": {
        "frequency": "Weekly",
        "daysOfWeek": ["Monday"],
        "startDate": "2026-03-23T08:00:00Z",
        "endDate": "2027-03-23T08:00:00Z"
      },
      "status": "Enabled",
      "viewId": "/providers/Microsoft.CostManagement/views/onioncraft-weekly-view",
      "scope": "/subscriptions/'"${SUB_ID}"'/resourceGroups/onioncraft-rg"
    }
  }'
```

> **What you receive:** An email every Monday with a chart showing actual cost to date and projected cost through the end of the billing cycle, scoped to the `onioncraft-rg` resource group.

### 2. Budget with Threshold Alerts

Set a monthly budget with alerts at 50%, 80%, and 100% (both actual and forecasted):

```bash
az consumption budget create \
  --budget-name onioncraft-budget \
  --amount 5 \
  --time-grain Monthly \
  --resource-group onioncraft-rg \
  --category Cost \
  --start-date 2026-04-01 \
  --end-date 2027-04-01 \
  --notifications '{
    "actual50": {
      "enabled": true,
      "operator": "GreaterThan",
      "threshold": 50,
      "contactEmails": ["tim@robichaux.net"],
      "thresholdType": "Actual"
    },
    "actual80": {
      "enabled": true,
      "operator": "GreaterThan",
      "threshold": 80,
      "contactEmails": ["tim@robichaux.net"],
      "thresholdType": "Actual"
    },
    "forecast100": {
      "enabled": true,
      "operator": "GreaterThan",
      "threshold": 100,
      "contactEmails": ["tim@robichaux.net"],
      "thresholdType": "Forecasted"
    }
  }'
```

> **Budget is set to $5/month** — generous headroom above the revised ~$0.05–0.15/month estimate. The addition of persisted skin collection data (owned IDs, metadata) increases Table Storage transactions by ~200/month — well within the existing budget and alert thresholds. No changes needed to alert configuration.

### 3. MSDN Spending Cap

Your MSDN Visual Studio Ultimate subscription includes a **hard $150/month spending cap**. When credits are exhausted:
- All pay-as-you-go services are **automatically disabled**
- Static Web App (Free tier) continues working (it's always free)
- Table Storage stops responding until the next billing cycle

**Verify your cap is enabled:**
```bash
# Check in Azure Portal: Subscriptions → your sub → Overview
# Look for "Spending limit: On" — this is the MSDN hard cap
```

> ⚠️ **Do not remove the spending cap.** It's the ultimate safety net.

### 4. Resource Group Isolation

All OnionCraft resources live in a single resource group (`onioncraft-rg`). This provides:
- **Cost scoping**: Weekly reports and budgets are scoped to this RG only
- **Kill switch**: `az group delete --name onioncraft-rg` stops all charges instantly
- **Clear separation** from any other Azure resources on the subscription

### Summary of Billing Controls

| Control | Frequency | Action |
|---------|-----------|--------|
| **Weekly email report** | Every Monday | Actual spend + forecast for billing cycle |
| **Budget alert (50%)** | When triggered | Email at $2.50 actual spend |
| **Budget alert (80%)** | When triggered | Email at $4.00 actual spend |
| **Budget alert (forecast)** | When triggered | Email when forecast exceeds $5 |
| **MSDN spending cap** | Monthly | Hard stop at $150/month (subscription-wide) |
| **Resource group kill switch** | On demand | `az group delete` to stop all charges |
