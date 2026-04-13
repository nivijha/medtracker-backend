# MedTracker Backend

A robust Node.js backend API for medical tracking and management system. This application provides secure authentication, user management, and comprehensive medical reporting features.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [API Endpoints](#api-endpoints)
- [Authentication](#authentication)
- [Models](#models)
- [Contributing](#contributing)

## Features

- **User Authentication**: Secure user registration, login with JWT, and **Direct Google Login (OAuth 2.0)**
- **User Management**: Complete CRUD operations for user profiles
- **Medical Reports**: Create, read, update, and delete medical reports
- **Test Management**: Track and manage medical test records
- **Appointment Scheduling**: Manage doctor appointments
- **Medication Tracking**: Track prescriptions and schedules
- **AI Medical Summaries**: Automated LLaMA-based medical report extraction with structured markdown response formatting
- **Secure Document Handling**: Secure internal proxy routing for sensitive medical PDFs to prevent unauthorized access
- **Activity Monitoring**: View recent account activity
- **Middleware Protection**: Route protection with authentication middleware
- **Database Integration**: Structured data models for users, reports, tests, appointments, and medications

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB
- **Authentication**: JWT (JSON Web Tokens)
- **Language**: JavaScript (ES6+)
- **Cloud Storage**: Cloudinary
- **AI Integration**: Hugging Face (Llama), Google Gemini, NVIDIA NIM (Llama)

## Project Structure

```
medtracker-backend/
├── config/
│   ├── cloudinary.js         # Cloudinary configuration
│   ├── db.js                 # Database configuration
│   ├── gemini.js             # Google Gemini AI config
│   ├── llama_ocr.js          # Llama OCR config
│   └── llama_summary.js      # Llama Summary config
├── controllers/
│   ├── activityController.js    # Activity logic
│   ├── appointmentController.js # Appointment logic
│   ├── authController.js        # Authentication logic
│   ├── googleAuthController.js  # Google OAuth logic
│   ├── medicationController.js  # Medication logic
│   ├── miscController.js        # Miscellaneous logic
│   ├── profileController.js     # User profile logic
│   ├── reportController.js      # Report logic
│   └── testController.js        # Test logic
├── middleware/
│   ├── authMiddleware.js     # JWT authentication middleware
│   ├── errorMiddleware.js    # Global error handler
│   └── uploadMiddleware.js   # File upload middleware
├── models/
│   ├── Appointment.js        # Appointment schema
│   ├── Healthmetric.js       # Health metrics schema
│   ├── Medication.js         # Medication schema
│   ├── Report.js             # Medical report schema
│   ├── Test.js               # Medical test schema
│   └── User.js               # User schema
├── routes/
│   ├── activityRoutes.js     # Activity routes
│   ├── appointmentRoutes.js  # Appointment routes
│   ├── authRoutes.js         # Authentication routes
│   ├── medicationRoutes.js   # Medication routes
│   ├── profileRoutes.js      # Profile routes
│   ├── reportRoutes.js       # Report routes
│   └── testRoutes.js         # Test routes
├── services/
│   └── authService.js        # Auth business logic
├── uploads/                  # Local upload directory
├── utils/
│   └── logger.js             # Logger utility
├── .env                      # Environment variables
├── .env.example              # Example environment variables
├── .gitignore                # Git ignore file
├── index.js                  # Application entry point
├── package.json              # Project dependencies
└── package-lock.json         # Locked dependencies
```

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v14 or higher)
- **npm**
- **MongoDB** (local or cloud instance)

## Installation

1. **Clone the repository**

```bash
git clone https://github.com/nivijha/medtracker-backend.git
cd medtracker-backend
```

1. **Install dependencies**

```bash
npm install
```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database
MONGO_URI=mongodb://localhost:27017/medtracker
# Or for MongoDB Atlas:
# MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/medtracker

# JWT Secret
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRE=7d

# Cloudinary (for file uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# AI Integration (Optional)
HF_TOKEN=your_hugging_face_token
GEMINI_API_KEY=your_gemini_api_key
NVIDIA_API_KEY=your_nvidia_api_key

# Optional: CORS Configuration
CLIENT_URL=http://localhost:3000
```

## Running the Application

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

The server will start on `http://localhost:5000` (or your configured PORT).

## API Endpoints

### Authentication Routes (`/api/auth`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/login` | User login | No |
| POST | `/api/auth/google` | Direct Google Login | No |
| GET | `/api/auth/me` | Get current user | Yes |
| POST | `/api/auth/logout` | User logout | Yes (cookie clearing) |

### Profile Routes (`/api/profile`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/profile` | Get user profile | Yes |
| PUT | `/api/profile` | Update user profile | Yes |
| GET | `/api/profile/summary` | Get health summary stats | Yes |
| PUT | `/api/profile/change-password` | Change password | Yes |

### Appointment Routes (`/api/appointments`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/appointments` | Get all appointments | Yes |
| GET | `/api/appointments/upcoming` | Get upcoming appointments | Yes |
| GET | `/api/appointments/past` | Get past appointments | Yes |
| POST | `/api/appointments` | Create appointment | Yes |
| PUT | `/api/appointments/:id/cancel` | Cancel appointment | Yes |
| DELETE | `/api/appointments/:id` | Delete appointment | Yes |

### Medication Routes (`/api/medications`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/medications` | Get all medications | Yes |
| GET | `/api/medications/schedule` | Get medication schedule | Yes |
| POST | `/api/medications` | Add new medication | Yes |
| POST | `/api/medications/:id/take` | Mark medication as taken | Yes |
| POST | `/api/medications/:id/refill` | Process refill | Yes |
| DELETE | `/api/medications/:id` | Delete medication | Yes |

### Report Routes (`/api/reports`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/reports/my` | Get logged-in user's reports | Yes |
| POST | `/api/reports/upload` | Upload medical report | Yes |
| DELETE | `/api/reports/:id` | Delete report | Yes |

### Test Routes (`/api/tests`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/tests/my` | Get logged-in user's tests | Yes |
| POST | `/api/tests` | Create new test result | Yes |
| DELETE | `/api/tests/:id` | Delete test result | Yes |

### Activity Routes (`/api/activity`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/activity` | Get recent activity | Yes |

### Chatbot Routes (`/api/chatbot`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/chatbot/chat` | Send message to AI Assistant | Yes |

### Contact Routes (`/api/contact`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/contact` | Submit contact/support form | No |
| GET | `/api/contact` | Fallback for simple HTML form submissions | No |

## Authentication

This API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header for protected routes:

```
Authorization: Bearer <your_jwt_token>
```

## Models

### User Model

- Email, Password (hashed), Name, Role, Phone, Address

### Appointment Model

- User, Doctor Name, Specialty, Hospital, Date, Status

### Medication Model

- User, Name, Dosage, Frequency, Start Date, End Date

### Report Model

- User, Type, File URL, Description, Report Date

### Test Model

- User, Test Name, Result, Reference Range, Unit, Date

### ContactMessage Model

- Name, Email, Subject, Message, Status, Date

### Healthmetric Model

- User, Blood Pressure, Heart Rate, Weight, Height, Blood Sugar, Date

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Links

- [Frontend Repository](https://github.com/nivijha/medtracker-frontend)
