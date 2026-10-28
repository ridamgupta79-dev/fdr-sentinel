# 🛡️ FDR Sentinel

### Digital Security Deposit & Fixed Deposit Receipt Management Portal

**FDR Sentinel** is a web-based portal designed to digitize and streamline the management of Fixed Deposit Receipts (FDRs) and security deposits. It provides a centralized interface for institutions and administrators to manage FDR records, verification workflows, release requests, and audit trails.

Built with **React, TypeScript, FastAPI, and SQLite**, the project focuses on structured workflows, role-based access, and traceable operations.

> **Project status:** Prototype / active development. Demo verification workflows do not constitute genuine bank confirmation.

---

## ✨ Features

- **Dashboard** — Centralized overview of FDR records and workflow activity.
- **Authentication & Authorization** — Login and role-based access for institutional users and administrators.
- **FDR Registry** — Register, browse, and track fixed deposit records.
- **FDR Verification** — Record verification actions and review verification history.
- **Release Management** — Submit, review, and track release requests.
- **Institution Management** — Manage institution records and access boundaries.
- **User Management** — Support administrative user-management workflows.
- **Audit Trail** — Track important operations for accountability and traceability.
- **Reports** — Access reporting functionality for portal records.
- **Responsive Interface** — React-based interface with reusable UI components and charts.

## 🧰 Tech Stack

| Category | Technology |
|---|---|
| Frontend | React, TypeScript |
| Build Tool | Vite |
| Styling | CSS |
| Icons | Lucide React |
| Charts | Recharts |
| Backend | Python, FastAPI |
| Validation | Pydantic |
| ORM | SQLAlchemy |
| Database | SQLite |
| API Documentation | OpenAPI, Swagger UI |
| Version Control | Git, GitHub |

## 🏗️ Architecture

```text
FDR Sentinel
│
├── frontend/
│   ├── public/
│   │   └── assets/
│   └── src/
│       ├── api/          # API client and endpoints
│       ├── components/   # Reusable UI components
│       ├── pages/        # Dashboard and portal pages
│       ├── state/        # Shared application state
│       ├── types/        # TypeScript types
│       └── utils/        # Formatting and CSV utilities
│
├── backend/
│   ├── services/         # Authentication and audit services
│   ├── main.py           # FastAPI application
│   ├── database.py       # Database configuration
│   ├── models.py         # Database models
│   ├── auth_routes.py    # Authentication routes
│   └── requirements.txt  # Python dependencies
│
├── scripts/              # Development and demo utilities
├── .gitignore
└── README.md
```

## 🔄 Core Workflow

1. **Authenticate** — Sign in using the configured authentication flow.
2. **Manage institutions** — Maintain institution information and user access.
3. **Register FDRs** — Create and maintain FDR records.
4. **Verify records** — Record verification actions and view their history.
5. **Request release** — Submit a release request for an eligible FDR.
6. **Review requests** — Authorized administrators review and process release requests.
7. **Track activity** — Use audit records to improve operational traceability.

## 🚀 Getting Started

### Prerequisites

Install the following before running the project:

- Python 3.11 recommended
- Node.js and npm
- Git

### 1. Clone the repository

```bash
git clone https://github.com/ridamgupta79-dev/fdr-sentinel.git
cd fdr-sentinel
```

### 2. Set up the backend

Create a virtual environment:

**Windows PowerShell**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
pip install -r backend/requirements.txt
```

Configure the required environment variables, including a strong, private `FDR_JWT_SECRET`.

Start the backend from the project root:

```powershell
python -m uvicorn backend.main:app --reload
```

The API will usually be available at:

- API: http://127.0.0.1:8000
- Swagger documentation: http://127.0.0.1:8000/docs
- Health endpoint: http://127.0.0.1:8000/health

### 3. Set up the frontend

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, usually:

http://localhost:5173

Keep the backend running while using the frontend.

## 🧪 Testing

Run the backend tests from the project root:

```powershell
python -m pytest
```

Run the frontend production build:

```powershell
cd frontend
npm run build
```

## 🔐 Security & Data Integrity

- Never commit `.env` files, credentials, passwords, JWT secrets, or access tokens.
- Keep local database files and private backups out of the public repository.
- Use synthetic data for demonstrations and development.
- Demo verification records must not be represented as confirmation from a real bank.
- Enforce authentication, authorization, and valid FDR lifecycle transitions on the backend.
- Configure production-grade secrets, HTTPS, backups, logging, and database security before deployment.

## 🗺️ Future Improvements

- Expand dashboard analytics and reporting.
- Improve FDR lifecycle validation and release eligibility checks.
- Add comprehensive automated API and end-to-end tests.
- Integrate authorized external verification services where available.
- Improve deployment, monitoring, and production database support.

## 👨‍💻 Developer

**Ridam Gupta**

- GitHub: [ridamgupta79-dev](https://github.com/ridamgupta79-dev)
- Project repository: [FDR Sentinel](https://github.com/ridamgupta79-dev/fdr-sentinel)

---

## 📌 Disclaimer

FDR Sentinel is a software prototype for FDR and security deposit workflow management. It does not independently verify the authenticity of financial instruments, guarantee the availability of funds, or execute financial transactions. Real-world deployment requires appropriate institutional authorization, security controls, and verified integrations.
