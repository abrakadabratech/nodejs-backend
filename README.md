# Abrakadabra – Node.js Backend Server

Node.js backend built and deployed on **Google Cloud App Engine**. This backend supports multiple features including auth using firebase.

---

## Project Structure

```
.
├── src/
│   ├── admin/       # Admin module
│   ├── app/         # Core app logic
│   ├── auth/        # Authentication logic
│   ├── products/    # Product-related APIs
│   ├── scripts/     # Scripts and automation
│   ├── users/       # User management
│   └── utils/       # Utility functions
├── index.js         # App entry point
├── app.yaml         # GCP production config
├── app.dev.yaml     # GCP development config
├── package.json     # Project metadata and scripts
├── .gitignore
├── .gcloudignore
```

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/abrakadabra-app.git
cd abrakadabra-app
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Locally

```bash
npm run start:dev
```

> This uses `nodemon` to auto-restart the server on file changes.

---

## Deployment

Before deploying, make sure you have the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed and initialized.

### Deploy to Development

```bash
npm run deploy:dev
```

This uses `app.dev.yaml` and deploys to the `abrakadabra-dev` project.

### Deploy to Production

```bash
npm run deploy:production
```

This uses `app.yaml` and please configure the gcloud project before deployment
